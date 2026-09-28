---
"@sherif-fanous/pi-notification-center": minor
---

- Changed: **Breaking:** Rename the settings `maxToastsVisible` to
  `toast.maxVisible` and `toast.timeout` to `toast.timeoutMs`. Notification
  Center updates your file at the next session start and shows a message naming
  it
- Changed: Add `"version": 2` to the configuration file. A file without it still
  loads; a file with another version is ignored with a warning instead of being
  misread
- Added: Add `/notifications status`, which shows whether toasts are on, how
  many notifications this session has captured, the toast settings in use, and
  the state of your configuration file
