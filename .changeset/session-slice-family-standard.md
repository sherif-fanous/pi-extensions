---
"@sherif-fanous/pi-session-slice": minor
---

- Changed: Give the `/slice` pickers an accent title, a `→` marker on the
  selected message, `PgUp`/`PgDn` paging, and a key-hint line that follows
  remapped Pi keys
- Changed: Answer an argument `/slice` doesn't accept with a warning that lists
  the valid forms, and write counts with real plurals
- Changed: Show a failure in `/slice` as one Session Slice error notification
  instead of Pi's generic extension error, and head warnings with Session Slice
- Fixed: Warn instead of crashing when `/slice` runs outside the TUI
- Fixed: Fit every picker line to the terminal width and cut long lines with
  `…`, so a narrow terminal can't crash Pi
