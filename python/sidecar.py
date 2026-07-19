#!/usr/bin/env python3
"""
NAS Slideshow — Python sidecar.

Provides:
  * SQLite database (people, per-image faces, image metadata)
  * Face detection + recognition via the `face_recognition` library
  * Offline voice transcription via Vosk over a WebSocket

All heavy dependencies are imported lazily / defensively so the sidecar still
starts (and the app still runs as a plain slideshow) when they are missing.
"""

import argparse
import io
import json
import os
import sqlite3
import struct
import threading
import urllib.request
from typing import List, Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Optional heavy dependencies
# ---------------------------------------------------------------------------
try:
    import face_recognition  # type: ignore

    FACE_OK = True
except Exception as exc:  # pragma: no cover - environment dependent
    face_recognition = None
    FACE_OK = False
    print(f"[sidecar] face_recognition unavailable: {exc}")

try:
    from PIL import Image  # type: ignore

    PIL_OK = True
except Exception as exc:
    Image = None
    PIL_OK = False
    print(f"[sidecar] Pillow unavailable: {exc}")

try:
    from vosk import Model as VoskModel, KaldiRecognizer  # type: ignore

    VOSK_OK = True
except Exception as exc:
    VoskModel = None
    KaldiRecognizer = None
    VOSK_OK = False
    print(f"[sidecar] vosk unavailable: {exc}")


HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "slideshow.db")
VOSK_MODEL_DIR = os.path.join(HERE, "models")
FACE_MATCH_THRESHOLD = 0.55  # lower = stricter

_db_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS people (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            is_named   INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS ref_encodings (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER NOT NULL,
            encoding  BLOB NOT NULL,
            FOREIGN KEY(person_id) REFERENCES people(id)
        );
        CREATE TABLE IF NOT EXISTS image_faces (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            path      TEXT NOT NULL,
            person_id INTEGER NOT NULL,
            top       REAL, right REAL, bottom REAL, left REAL,
            img_w     INTEGER, img_h INTEGER,
            encoding  BLOB,
            FOREIGN KEY(person_id) REFERENCES people(id)
        );
        CREATE INDEX IF NOT EXISTS idx_faces_path ON image_faces(path);
        CREATE TABLE IF NOT EXISTS image_meta (
            path        TEXT PRIMARY KEY,
            description TEXT DEFAULT '',
            place       TEXT DEFAULT '',
            year        TEXT DEFAULT '',
            tags        TEXT DEFAULT '',
            people      TEXT DEFAULT ''
        );
        """
    )
    # Migrate older databases that predate the `people` column.
    cols = [r[1] for r in conn.execute("PRAGMA table_info(image_meta)").fetchall()]
    if "people" not in cols:
        conn.execute("ALTER TABLE image_meta ADD COLUMN people TEXT DEFAULT ''")
    conn.commit()
    conn.close()


def enc_to_blob(enc: "np.ndarray") -> bytes:
    return enc.astype(np.float64).tobytes()


def blob_to_enc(blob: bytes) -> "np.ndarray":
    return np.frombuffer(blob, dtype=np.float64)


def next_unknown_name(conn: sqlite3.Connection) -> str:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM people WHERE is_named = 0"
    ).fetchone()
    return f"Unknown {row['c'] + 1}"


# ---------------------------------------------------------------------------
# Image loading (local path or http url)
# ---------------------------------------------------------------------------
def load_image(path: str) -> Optional["np.ndarray"]:
    if not (FACE_OK and PIL_OK):
        return None
    try:
        if path.startswith("http://") or path.startswith("https://"):
            req = urllib.request.Request(path, headers={"User-Agent": "slideshow"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            img = Image.open(io.BytesIO(data)).convert("RGB")
        else:
            img = Image.open(path).convert("RGB")
        return np.array(img)
    except Exception as exc:
        print(f"[sidecar] load_image failed for {path}: {exc}")
        return None


def load_pil(path: str):
    """Load a PIL image (preserving EXIF) from a local path or http url."""
    if not PIL_OK:
        return None
    try:
        if path.startswith("http://") or path.startswith("https://"):
            req = urllib.request.Request(path, headers={"User-Agent": "slideshow"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            return Image.open(io.BytesIO(data))
        return Image.open(path)
    except Exception as exc:
        print(f"[sidecar] load_pil failed for {path}: {exc}")
        return None


# ---------------------------------------------------------------------------
# EXIF metadata extraction (feature 7 auto-fill)
# ---------------------------------------------------------------------------
_geocode_cache: dict = {}


def _to_degrees(value) -> Optional[float]:
    try:
        d, m, s = value
        return float(d) + float(m) / 60.0 + float(s) / 3600.0
    except Exception:
        return None


def _reverse_geocode(lat: float, lon: float) -> str:
    """Best-effort reverse geocode via Nominatim; falls back to coordinates."""
    key = f"{round(lat, 3)},{round(lon, 3)}"
    if key in _geocode_cache:
        return _geocode_cache[key]
    place = f"{lat:.5f}, {lon:.5f}"
    try:
        url = (
            "https://nominatim.openstreetmap.org/reverse?format=json"
            f"&lat={lat}&lon={lon}&zoom=12"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "nas-slideshow/1.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        addr = data.get("address", {})
        parts = [
            addr.get("city") or addr.get("town") or addr.get("village")
            or addr.get("county"),
            addr.get("state"),
            addr.get("country"),
        ]
        named = ", ".join([p for p in parts if p])
        if named:
            place = named
    except Exception:
        pass
    _geocode_cache[key] = place
    return place


def extract_exif(path: str) -> dict:
    """Return {year, place, dateTaken, camera} parsed from image EXIF."""
    result = {"year": "", "place": "", "dateTaken": "", "camera": ""}
    img = load_pil(path)
    if img is None:
        return result
    try:
        from PIL.ExifTags import TAGS, GPSTAGS  # type: ignore

        exif = img.getexif()
        if not exif:
            return result

        # Camera make/model (top-level IFD).
        top = {TAGS.get(k, k): v for k, v in exif.items()}
        make = str(top.get("Make", "")).strip()
        model = str(top.get("Model", "")).strip()
        result["camera"] = (make + " " + model).strip()

        # Date taken lives in the Exif sub-IFD (0x8769); fall back to top-level.
        date_str = ""
        try:
            sub = exif.get_ifd(0x8769)
            sub_named = {TAGS.get(k, k): v for k, v in sub.items()}
            date_str = str(
                sub_named.get("DateTimeOriginal")
                or sub_named.get("DateTimeDigitized")
                or ""
            )
        except Exception:
            pass
        if not date_str:
            date_str = str(top.get("DateTime", ""))
        if date_str:
            result["dateTaken"] = date_str
            # Format "YYYY:MM:DD HH:MM:SS" -> year prefix.
            year = date_str[:4]
            if year.isdigit():
                result["year"] = year

        # GPS -> place.
        try:
            gps = exif.get_ifd(0x8825)
            if gps:
                g = {GPSTAGS.get(k, k): v for k, v in gps.items()}
                lat = _to_degrees(g.get("GPSLatitude"))
                lon = _to_degrees(g.get("GPSLongitude"))
                if lat is not None and lon is not None:
                    if g.get("GPSLatitudeRef") == "S":
                        lat = -lat
                    if g.get("GPSLongitudeRef") == "W":
                        lon = -lon
                    result["place"] = _reverse_geocode(lat, lon)
        except Exception:
            pass
    except Exception as exc:
        print(f"[sidecar] exif parse failed for {path}: {exc}")
    return result


# ---------------------------------------------------------------------------
# Face recognition
# ---------------------------------------------------------------------------
def match_person(conn: sqlite3.Connection, encoding: "np.ndarray") -> Optional[int]:
    rows = conn.execute("SELECT person_id, encoding FROM ref_encodings").fetchall()
    if not rows:
        return None
    known = np.array([blob_to_enc(r["encoding"]) for r in rows])
    dists = np.linalg.norm(known - encoding, axis=1)
    idx = int(np.argmin(dists))
    if dists[idx] <= FACE_MATCH_THRESHOLD:
        return int(rows[idx]["person_id"])
    return None


def detect_and_store(conn: sqlite3.Connection, path: str) -> List[dict]:
    image = load_image(path)
    if image is None:
        return []
    h, w = image.shape[0], image.shape[1]
    locations = face_recognition.face_locations(image, model="hog")
    encodings = face_recognition.face_encodings(image, locations)
    results = []
    for (top, right, bottom, left), enc in zip(locations, encodings):
        person_id = match_person(conn, enc)
        if person_id is None:
            name = next_unknown_name(conn)
            cur = conn.execute(
                "INSERT INTO people(name, is_named) VALUES (?, 0)", (name,)
            )
            person_id = cur.lastrowid
            conn.execute(
                "INSERT INTO ref_encodings(person_id, encoding) VALUES (?, ?)",
                (person_id, enc_to_blob(enc)),
            )
        cur = conn.execute(
            """INSERT INTO image_faces(path, person_id, top, right, bottom, left,
                                       img_w, img_h, encoding)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (path, person_id, top, right, bottom, left, w, h, enc_to_blob(enc)),
        )
        face_id = cur.lastrowid
        results.append(_face_row(conn, face_id))
    conn.commit()
    return results


def _face_row(conn: sqlite3.Connection, face_id: int) -> dict:
    r = conn.execute(
        """SELECT f.id, f.person_id, f.top, f.right, f.bottom, f.left,
                  f.img_w, f.img_h, p.name
             FROM image_faces f JOIN people p ON p.id = f.person_id
            WHERE f.id = ?""",
        (face_id,),
    ).fetchone()
    w = r["img_w"] or 1
    h = r["img_h"] or 1
    return {
        "faceId": r["id"],
        "personId": r["person_id"],
        "name": r["name"],
        "top": r["top"] / h,
        "right": r["right"] / w,
        "bottom": r["bottom"] / h,
        "left": r["left"] / w,
        "confidence": 1.0,
    }


def faces_for_path(conn: sqlite3.Connection, path: str) -> List[dict]:
    rows = conn.execute(
        "SELECT id FROM image_faces WHERE path = ?", (path,)
    ).fetchall()
    return [_face_row(conn, r["id"]) for r in rows]


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="NAS Slideshow Sidecar")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanReq(BaseModel):
    path: str
    force: bool = False


class RelabelReq(BaseModel):
    faceId: int
    name: str


class RenameReq(BaseModel):
    personId: int
    name: str


class MetaReq(BaseModel):
    path: str
    description: str = ""
    place: str = ""
    year: str = ""
    tags: List[str] = []
    people: List[dict] = []


@app.get("/health")
def health():
    return {
        "ok": True,
        "face_recognition": FACE_OK and PIL_OK,
        "vosk": VOSK_OK and os.path.isdir(VOSK_MODEL_DIR),
    }


@app.post("/faces/scan")
def faces_scan(req: ScanReq):
    if not (FACE_OK and PIL_OK):
        return {"available": False, "faces": []}
    with _db_lock:
        conn = get_db()
        try:
            existing = faces_for_path(conn, req.path)
            if existing and not req.force:
                return {"available": True, "faces": existing, "cached": True}
            if req.force:
                conn.execute("DELETE FROM image_faces WHERE path = ?", (req.path,))
                conn.commit()
            faces = detect_and_store(conn, req.path)
            return {"available": True, "faces": faces, "cached": False}
        finally:
            conn.close()


@app.get("/people")
def list_people():
    with _db_lock:
        conn = get_db()
        try:
            rows = conn.execute(
                """SELECT p.id, p.name,
                          (SELECT COUNT(*) FROM image_faces f WHERE f.person_id = p.id) AS c
                     FROM people p ORDER BY p.name"""
            ).fetchall()
            return [{"id": r["id"], "name": r["name"], "faceCount": r["c"]} for r in rows]
        finally:
            conn.close()


def _get_or_create_named_person(conn: sqlite3.Connection, name: str) -> int:
    row = conn.execute(
        "SELECT id FROM people WHERE name = ? AND is_named = 1", (name,)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT INTO people(name, is_named) VALUES (?, 1)", (name,))
    return cur.lastrowid


@app.post("/faces/relabel")
def relabel_face(req: RelabelReq):
    """Assign a specific detected face to a (named) person and learn from it."""
    with _db_lock:
        conn = get_db()
        try:
            face = conn.execute(
                "SELECT person_id, encoding FROM image_faces WHERE id = ?",
                (req.faceId,),
            ).fetchone()
            if not face:
                return {"ok": False, "error": "face not found"}
            person_id = _get_or_create_named_person(conn, req.name.strip())
            conn.execute(
                "UPDATE image_faces SET person_id = ? WHERE id = ?",
                (person_id, req.faceId),
            )
            if face["encoding"]:
                conn.execute(
                    "INSERT INTO ref_encodings(person_id, encoding) VALUES (?, ?)",
                    (person_id, face["encoding"]),
                )
            conn.commit()
            return {"ok": True, "personId": person_id, "name": req.name.strip()}
        finally:
            conn.close()


@app.post("/people/rename")
def rename_person(req: RenameReq):
    with _db_lock:
        conn = get_db()
        try:
            conn.execute(
                "UPDATE people SET name = ?, is_named = 1 WHERE id = ?",
                (req.name.strip(), req.personId),
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()


@app.get("/exif")
def get_exif(path: str):
    return extract_exif(path)


@app.get("/metadata")
def get_metadata(path: str):
    with _db_lock:
        conn = get_db()
        try:
            r = conn.execute(
                "SELECT * FROM image_meta WHERE path = ?", (path,)
            ).fetchone()
            if not r:
                return {
                    "path": path,
                    "description": "",
                    "place": "",
                    "year": "",
                    "tags": [],
                    "people": [],
                }
            people = []
            raw_people = r["people"] if "people" in r.keys() else ""
            if raw_people:
                try:
                    people = json.loads(raw_people)
                except Exception:
                    people = []
            return {
                "path": path,
                "description": r["description"],
                "place": r["place"],
                "year": r["year"],
                "tags": [t for t in (r["tags"] or "").split("\n") if t],
                "people": people,
            }
        finally:
            conn.close()


@app.post("/metadata")
def set_metadata(req: MetaReq):
    with _db_lock:
        conn = get_db()
        try:
            conn.execute(
                """INSERT INTO image_meta(path, description, place, year, tags, people)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(path) DO UPDATE SET
                     description = excluded.description,
                     place       = excluded.place,
                     year        = excluded.year,
                     tags        = excluded.tags,
                     people      = excluded.people""",
                (
                    req.path,
                    req.description,
                    req.place,
                    req.year,
                    "\n".join(req.tags),
                    json.dumps(req.people or []),
                ),
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Voice (Vosk) over WebSocket. Renderer streams 16kHz mono PCM16 frames.
# ---------------------------------------------------------------------------
_vosk_model = None


def get_vosk_model():
    global _vosk_model
    if not VOSK_OK:
        return None
    if _vosk_model is not None:
        return _vosk_model
    if not os.path.isdir(VOSK_MODEL_DIR):
        return None
    try:
        _vosk_model = VoskModel(VOSK_MODEL_DIR)
    except Exception as exc:
        print(f"[sidecar] failed to load vosk model: {exc}")
        _vosk_model = None
    return _vosk_model


@app.websocket("/voice")
async def voice_ws(ws: WebSocket):
    await ws.accept()
    model = get_vosk_model()
    if model is None:
        await ws.send_text(json.dumps({"error": "voice model unavailable"}))
        await ws.close()
        return
    rec = KaldiRecognizer(model, 16000)
    rec.SetWords(True)
    try:
        while True:
            data = await ws.receive_bytes()
            if rec.AcceptWaveform(data):
                res = json.loads(rec.Result())
                if res.get("text"):
                    await ws.send_text(json.dumps({"final": res["text"]}))
            else:
                res = json.loads(rec.PartialResult())
                if res.get("partial"):
                    await ws.send_text(json.dumps({"partial": res["partial"]}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[sidecar] voice ws error: {exc}")
        try:
            await ws.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8756)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    init_db()
    print(f"[sidecar] starting on {args.host}:{args.port} "
          f"(faces={FACE_OK and PIL_OK}, vosk={VOSK_OK})")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
