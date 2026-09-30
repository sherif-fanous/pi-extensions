# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.6.0] - 2026-09-29

### Changed

- **Breaking:** Read the configuration from `theme-sync/config.json` in each
  scope and rename `isSyncActive` to `syncEnabled`. At session start, Theme Sync
  moves `settings.json`, or the older `theme-sync.json`, to `config.json`,
  renames the key, and shows one message naming the new files. A file that can't
  be migrated stays where it is, with a warning
- **Breaking:** Read the Project configuration only when Pi trusts the project.
  In an untrusted project, Theme Sync skips the file and warns once
- Add `"version": 2` to the configuration file. A file without it still loads; a
  file with another version is ignored with a warning instead of being misread
- Show the warnings Theme Sync finds at startup as one notification. Warnings
  found later stay in `/theme-sync status`
- Label the scopes User and Project instead of Global and Project, write report
  labels in sentence case, and show progress messages in muted text instead of
  the warning color
- Show `Sync: on` or `Sync: off` in the `/theme-sync` window
- Draw the `/theme-sync` window with the shared frame, size, and key hints, and
  title it in Title Case
- Warn instead of showing an error when `/theme-sync` runs outside the TUI
- Show a failure in `/theme-sync` or at startup as one Theme Sync error
  notification, and word a failed save or reload as `Could not …`
- Save the configuration atomically, so an interrupted save leaves either the
  old or the new file
- Update `@sherif-fanous/pi-extensions-core` to 0.1.0

### Added

- Add a `Config:` block to `/theme-sync status` with each file's path and state
- Add F1 help for the focused field of the `/theme-sync` window

### Fixed

- Fall back to the User value, then the default, when a Project value is invalid
  or names a theme Pi doesn't have, instead of going straight to the default
- Warn about an unreadable configuration file and continue with the other scope
  and the defaults, instead of failing at startup
- Show when the appearance last changed in `/theme-sync status` with polling
  detection, instead of refreshing Last update and Last event on every poll
- Report a theme you changed by hand as `Drift corrected` in
  `/theme-sync status` with polling detection, as a subscription already did
- Report a recurring failure to read Pi's theme as a warning in
  `/theme-sync status` with polling detection, instead of ignoring it

## [0.5.0] - 2026-09-08

### Changed

- Open `/theme-sync` directly in a complete configuration window that keeps its
  title, content, and footer visible when the terminal is resized
  ([#21](https://github.com/sherif-fanous/pi-theme-sync/pull/21))
- Edit polling intervals with Pi's focused text input and show validation errors
  inside the configuration window
  ([#21](https://github.com/sherif-fanous/pi-theme-sync/pull/21))
- Prefer `.pi/theme-sync/settings.json` for project settings and
  `~/.pi/agent/theme-sync/settings.json` for global settings; deprecate the old
  `theme-sync.json` paths while retaining them as per-scope fallbacks
  ([#20](https://github.com/sherif-fanous/pi-theme-sync/pull/20))
- Limit polling intervals to 1000 through 60000 milliseconds and use the 2000ms
  default with a warning for values outside that range
  ([#19](https://github.com/sherif-fanous/pi-theme-sync/pull/19))

### Added

- Add `/theme-sync status` with command completion, an aligned themed transcript
  report in TUI mode, and notification output in other modes
  ([#21](https://github.com/sherif-fanous/pi-theme-sync/pull/21))
- Show whether each effective configuration value comes from Project, Global, or
  Default settings
  ([#19](https://github.com/sherif-fanous/pi-theme-sync/pull/19))

### Removed

- Remove the Config and Status landing menu and the temporary Status overlay;
  use `/theme-sync` for configuration and `/theme-sync status` for runtime
  status ([#21](https://github.com/sherif-fanous/pi-theme-sync/pull/21))

### Fixed

- Continue through lower-priority detectors when a query fails, contain
  recurring failures, stop startup probes with their session, time out system
  appearance commands, and classify short OSC 11 color channels correctly
  ([#19](https://github.com/sherif-fanous/pi-theme-sync/pull/19))
- Preserve unrelated settings and refuse malformed or non-object JSON without
  changing the file, while preventing edits and duplicate saves during
  persistence ([#19](https://github.com/sherif-fanous/pi-theme-sync/pull/19))
- Honor Pi's configured agent directory, including `PI_CODING_AGENT_DIR` and
  tilde expansion, for global settings
  ([#19](https://github.com/sherif-fanous/pi-theme-sync/pull/19))
- Close the configuration window before `Ctrl+R` reloads Pi, wait for reload to
  finish, and report reload failures
  ([#19](https://github.com/sherif-fanous/pi-theme-sync/pull/19))
- Restrict terminal queries and interactive windows to TUI mode so they do not
  run in RPC or print modes
  ([#19](https://github.com/sherif-fanous/pi-theme-sync/pull/19))

## [0.4.2] - 2026-07-31

### Fixed

- Keep theme sync following the terminal when a host reports notification
  support but sends no color-scheme reports, by rechecking the full detector
  chain ([#17](https://github.com/sherif-fanous/pi-theme-sync/pull/17))
- Report the detector that is actually tracking appearance after notifications
  stop arriving, remove the inactive subscription from `Available Detectors:`,
  and record the fallback warning
  ([#17](https://github.com/sherif-fanous/pi-theme-sync/pull/17))

## [0.4.1] - 2026-07-30

### Fixed

- Wrap long overlay text with hanging indentation so status warnings, status
  values, and configuration messages remain aligned at narrow terminal widths
  ([#15](https://github.com/sherif-fanous/pi-theme-sync/pull/15))

## [0.4.0] - 2026-07-30

### Changed

- **Breaking:** Require Pi 0.79.7 or newer
  ([#13](https://github.com/sherif-fanous/pi-theme-sync/pull/13))
- Read terminal appearance through Pi's color-scheme API and report the active
  strategy as `Terminal Color Scheme` or `Terminal Color Scheme (subscription)`
  ([#13](https://github.com/sherif-fanous/pi-theme-sync/pull/13))
- Fall back to OSC 11 and system appearance on older Pi versions and report the
  host Pi version and reason
  ([#13](https://github.com/sherif-fanous/pi-theme-sync/pull/13))

### Removed

- Remove raw DSR 996/997 polling and the DEC mode 2031 notification listener
  while retaining OSC 11 and system appearance fallbacks
  ([#13](https://github.com/sherif-fanous/pi-theme-sync/pull/13))

## [0.3.1] - 2026-07-10

### Fixed

- Prevent Pi from crashing when `/new`, `/fork`, `/clone`, `/resume`, or
  `/reload` replaces a session during appearance detection
  ([#9](https://github.com/sherif-fanous/pi-theme-sync/pull/9))

## [0.3.0] - 2026-05-12

### Changed

- **Breaking:** Target Pi from the `@earendil-works` npm scope and require Pi
  0.74.0 or newer ([#4](https://github.com/sherif-fanous/pi-theme-sync/pull/4))

## [0.2.0] - 2026-03-20

### Changed

- Require `/reload` before configuration changes take effect
  ([`95bd635`](https://github.com/sherif-fanous/pi-theme-sync/commit/95bd635779667ef489497d2ffae9d40ff25cd818))

### Added

- Add `/theme-sync` with Config and Status overlay options
  ([`95bd635`](https://github.com/sherif-fanous/pi-theme-sync/commit/95bd635779667ef489497d2ffae9d40ff25cd818))
- Add `isSyncActive` to enable or disable ongoing theme synchronization,
  defaulting to `true`
  ([`95bd635`](https://github.com/sherif-fanous/pi-theme-sync/commit/95bd635779667ef489497d2ffae9d40ff25cd818))

## [0.1.0] - 2026-03-17

_Initial release._

[0.6.0]:
  https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-theme-sync%400.6.0
[0.5.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.5.0
[0.4.2]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.4.2
[0.4.1]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.4.1
[0.4.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.4.0
[0.3.1]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.3.1
[0.3.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.3.0
[0.2.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.2.0
[0.1.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.1.0
