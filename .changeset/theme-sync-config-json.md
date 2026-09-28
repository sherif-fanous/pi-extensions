---
"@sherif-fanous/pi-theme-sync": minor
---

- Changed: **Breaking:** Read the configuration from `theme-sync/config.json` in
  each scope and rename `isSyncActive` to `syncEnabled`. At session start, Theme
  Sync moves `settings.json`, or the older `theme-sync.json`, to `config.json`,
  renames the key, and shows one message naming the new files. A file that can't
  be migrated stays where it is, with a warning
- Changed: **Breaking:** Read the Project configuration only when Pi trusts the
  project. In an untrusted project, Theme Sync skips the file and warns once
- Changed: Add `"version": 2` to the configuration file. A file without it still
  loads; a file with another version is ignored with a warning instead of being
  misread
- Added: Add a `Config:` block to `/theme-sync status` with each file's path and
  state
- Fixed: Fall back to the User value, then the default, when a Project value is
  invalid or names a theme Pi doesn't have, instead of going straight to the
  default
- Fixed: Warn about an unreadable configuration file and continue with the other
  scope and the defaults, instead of failing at startup
