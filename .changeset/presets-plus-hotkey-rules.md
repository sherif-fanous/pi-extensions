---
"@sherif-fanous/pi-presets-plus": patch
---

- Fixed: Warn in the preset editor that a hotkey is already used only when
  another preset would get the key, not when the preset you edit comes first and
  keeps it, or when the other preset is a User preset that a Project preset of
  the same name replaces
- Fixed: Stop asking you to run `/reload` in the preset editor when a hotkey
  changes only in case or modifier order, such as `Ctrl+P` to `ctrl+p`
