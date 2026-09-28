---
"@sherif-fanous/pi-notification-center": minor
---

- Changed: Draw the notification browser with the shared frame and key hints.
  Its footer wraps instead of being cut off and follows remapped Pi keys, and
  its list wraps around at the ends and shows its `(n/m)` position when it
  scrolls
- Changed: Show configuration warnings as one notification, in the wording every
  extension in the family uses
- Changed: Show a failure in `/notifications` or at startup as one Notification
  Center error notification
- Changed: Answer an argument `/notifications` doesn't accept with a warning
  that lists the valid forms, and shorten the command's description
