---
"@sherif-fanous/pi-presets-plus": minor
---

- Changed: **Breaking:** Read the Project configuration only when Pi trusts the
  project. In an untrusted project, Presets Plus skips the file with one warning
  and refuses to save to it
- Changed: Show configuration warnings at session start and after
  `/presets reload`, instead of every time the picker opens
- Changed: Load a `config.json` without `version` as version 2
- Added: Add a `Config:` block to `/presets status` with each file's path and
  state
