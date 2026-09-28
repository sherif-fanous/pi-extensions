---
"@sherif-fanous/pi-theme-sync": minor
---

- Changed: Show the warnings Theme Sync finds at startup as one notification.
  Warnings found later stay in `/theme-sync status`
- Changed: Label the scopes User and Project instead of Global and Project,
  write report labels in sentence case, and show progress messages in muted text
  instead of the warning color
- Changed: Show `Sync: on` or `Sync: off` in the `/theme-sync` window
- Changed: Draw the `/theme-sync` window with the shared frame, size, and key
  hints, and title it in Title Case
- Changed: Warn instead of showing an error when `/theme-sync` runs outside the
  TUI
- Changed: Show a failure in `/theme-sync` or at startup as one Theme Sync error
  notification, and word a failed save or reload as `Could not …`
- Changed: Save the configuration atomically, so an interrupted save leaves
  either the old or the new file
- Added: Add F1 help for the focused field of the `/theme-sync` window
