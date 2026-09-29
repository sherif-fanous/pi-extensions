---
"@sherif-fanous/pi-presets-plus": patch
---

- Fixed: Mark the active preset as changed when you turn tools on after
  activating a preset whose tools Pi doesn't have, matching what
  `/presets status` already reported
- Fixed: Apply a preset again when you activate it after changing the tools it
  carried over from an earlier preset, instead of marking it unchanged until the
  next turn
- Fixed: Activating the active preset again no longer re-applies it and repeats
  the ignored-tools warning when it names a tool Pi doesn't have
