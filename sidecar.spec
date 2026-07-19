# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec that bundles the Python sidecar into a single self-contained
`sidecar.exe` (or `sidecar` on macOS/Linux), so end users do not need Python or
pip installed.

Build with:
    npm run py:bundle
    # -> produces dist-sidecar/sidecar(.exe)

Notes:
  * face_recognition/dlib and vosk ship native libraries and data files.
    PyInstaller usually needs help finding them; the collect_* helpers below
    gather everything. If a runtime import still fails, add the offending
    package to `hiddenimports` or `datas`.
  * The Vosk speech model itself is NOT bundled here (it is large and optional).
    It is shipped separately as python/models via electron-builder extraResources.
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = []
binaries = []
hiddenimports = []

# uvicorn/fastapi rely on dynamically imported modules.
hiddenimports += collect_submodules("uvicorn")
hiddenimports += [
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]

for pkg in ("face_recognition", "face_recognition_models", "dlib", "vosk", "PIL"):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        # Package not installed at build time -> feature simply unavailable.
        pass


block_cipher = None

a = Analysis(
    ["python/sidecar.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
