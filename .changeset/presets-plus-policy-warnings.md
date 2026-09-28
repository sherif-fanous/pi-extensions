---
"@sherif-fanous/pi-presets-plus": patch
---

- Fixed: Show warnings about the User policy once with the other configuration
  warnings at session start, after `/presets reload`, and in `/presets status`,
  instead of on every activation, twice when a `--preset` activation was
  cancelled, and never when Pi restored a session
