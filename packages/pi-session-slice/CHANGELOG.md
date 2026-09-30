# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.2.0] - 2026-09-29

### Changed

- Give the `/slice` pickers an accent title, a `→` marker on the selected
  message, `PgUp`/`PgDn` paging, and a key-hint line that follows remapped Pi
  keys
- Answer an argument `/slice` doesn't accept with a warning that lists the valid
  forms, and write counts with real plurals
- Show a failure in `/slice` as one Session Slice error notification instead of
  Pi's generic extension error, and head warnings with Session Slice
- Update `@sherif-fanous/pi-extensions-core` to 0.1.0

### Fixed

- Warn instead of crashing when `/slice` runs outside the TUI
- Fit every picker line to the terminal width and cut long lines with `…`, so a
  narrow terminal can't crash Pi

## [0.1.0] - 2026-09-14

_Initial release._

[0.2.0]:
  https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-session-slice%400.2.0
[0.1.0]: https://github.com/sherif-fanous/pi-session-slice/releases/tag/v0.1.0
