---
"@sherif-fanous/pi-theme-sync": patch
---

- Fixed: With polling detection, `/theme-sync status` now shows when the
  appearance last changed instead of refreshing Last update and Last event on
  every poll
- Fixed: With polling detection, a theme you changed by hand is reported as
  `Drift corrected` in `/theme-sync status`, as it already was with a
  subscription
- Fixed: With polling detection, a recurring failure to read Pi's theme is now
  reported as a warning in `/theme-sync status` instead of being ignored
