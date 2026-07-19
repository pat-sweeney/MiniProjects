# NAS Slideshow v<!-- X.Y.Z -->

<!--
  Release checklist:
  1. Bump "version" in package.json.
  2. Update the notes below (or let GitHub auto-generate from .github/release.yml).
  3. Commit, then: git tag vX.Y.Z && git push origin vX.Y.Z
  4. CI (.github/workflows/build.yml) builds and publishes installers to this release.
-->

## Highlights

-

## ✨ Features

-

## 🐛 Fixes

-

## 📦 Downloads

| Platform | File |
| -------- | ---- |
| Windows  | `NAS-Slideshow-Setup-X.Y.Z.exe` (installer) / `NAS Slideshow X.Y.Z.exe` (portable) |
| macOS    | `NAS-Slideshow-X.Y.Z.dmg` |
| Linux    | `NAS-Slideshow-X.Y.Z.AppImage` |

## Notes

- Facial recognition and offline voice require the optional Python packages
  (`face_recognition`, `vosk`) and, for voice, a Vosk model in `python/models/`.
- Auto-update is enabled: installed apps check this release feed on launch.
