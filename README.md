# NAS Slideshow

An Electron + React desktop slideshow app for photos and videos stored on a NAS or
local drive, with **facial recognition**, **offline voice control**, and **LLM-powered
tagging**.

## Features

1. **Sources** — scan a local folder *and/or* an HTTP(S) directory listing (NAS web
   share, Apache/nginx autoindex). All subdirectories are read recursively.
2. **Auto-advance** — each image is shown for a configurable duration, then the next
   item appears.
3. **Configurable transitions** — fade, dissolve, swipe (4 directions), zoom, flip,
   random, or none.
4. **Facial recognition** — a Python `face_recognition` sidecar detects and labels
   people, maintaining a SQLite database. Unrecognized faces are labeled `Unknown <N>`.
5. **Voice control** — offline speech (Vosk) is transcribed and parsed by a local LLM
   (Ollama) to label people or edit metadata by voice.
6. **Manual control** — keyboard/mouse navigation; click any face to rename it.
7. **Metadata tagging** — description, place, year, and free-form tags per image, via
   the panel or voice.
8. **Video support** — plays the first *N* seconds (configurable) of each video with
   audio, then advances.

## Architecture

```
Electron main (Node)          React renderer               Python sidecar (FastAPI)
─────────────────────         ────────────────             ────────────────────────
• file scanning (local/http)  • slideshow + transitions    • SQLite (people, faces,
• app:// media streaming        • face overlay + editing      image metadata)
  (Range/video support)         • settings / metadata UI    • face_recognition
• Ollama LLM parsing           • mic capture → PCM16        • Vosk voice WebSocket
• spawns/monitors sidecar        streamed to sidecar
```

## Prerequisites

- **Node.js 18+**
- **Python 3.9–3.12**
- **Ollama** running locally with a model pulled (e.g. `ollama pull llama3.1`) — only
  needed for voice/LLM parsing.

## Setup

```powershell
# 1. Node deps
npm install

# 2. Python sidecar deps (facial recognition + voice)
npm run py:install
#   Note: face_recognition needs dlib. On Windows, if the build fails, install a
#   prebuilt dlib wheel first, then re-run the command above.

# 3. (Optional) Offline voice model — download and unzip into python/models/
#    https://alphacephei.com/vosk/models  (e.g. vosk-model-small-en-us-0.15)
#    so that python/models/ contains am/, conf/, graph/, ...
```

## Run

```powershell
npm run dev      # launches Electron + Vite dev server (auto-spawns the sidecar)
```

The app also works as a **plain slideshow** if Python/Ollama/Vosk are missing —
face and voice features simply report as unavailable.

## Build

```powershell
npm run build
```

## Packaging a distributable installer

The app is packaged with **electron-builder**. To make the sidecar work on
machines without Python installed, first bundle it into a self-contained
executable with **PyInstaller**, then build the installer:

```powershell
# 1. (Optional but recommended) build a self-contained sidecar.exe
python -m pip install pyinstaller
npm run py:bundle            # -> dist-sidecar/sidecar.exe

# 2. Build the app installer(s)
npm run dist:win             # NSIS installer + portable .exe (Windows)
# or: npm run dist            # current platform
# or: npm run dist:dir        # unpacked app folder (no installer)
```

Output is written to `release/`. The Python sidecar (either the bundled
`sidecar.exe` or the raw `python/` scripts) and an optional `python/models/`
Vosk model are copied in as `extraResources`. At runtime the app launches the
bundled `sidecar.exe` if present, otherwise falls back to a system Python
interpreter running `python/sidecar.py`.

> **Windows note:** electron-builder downloads a `winCodeSign` toolchain that
> contains macOS symlinks. Extracting it requires symlink privileges — enable
> **Windows Developer Mode** (Settings → Privacy & security → For developers) or
> run the packaging command from an **elevated** terminal, otherwise you may see
> `Cannot create symbolic link : A required privilege is not held`.

### EXIF auto-fill

When you open the metadata panel (`E`) for an image, empty **year** and
**place** fields are auto-populated from the photo's EXIF data (date taken and,
when GPS is present, a reverse-geocoded location via OpenStreetMap Nominatim).
You can edit the suggestions before saving.

## Keyboard shortcuts

| Key            | Action                  |
| -------------- | ----------------------- |
| `←` / `→`      | Previous / next         |
| `Space`        | Play / pause            |
| `E`            | Toggle metadata panel   |
| `S`            | Toggle settings panel   |
| `V`            | Toggle voice control    |

## Voice examples

- "That's my grandmother Alice"
- "Label unknown 2 as Bob"
- "This was taken in Paris in 1998"
- "Add description: birthday party at the lake"
- "Next photo" / "Pause"
