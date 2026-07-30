# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.4.1] - 2026-07-30

### Fixed

- Long lines in the `/theme-sync` overlays now wrap with a hanging indent instead of restarting at the left edge. Status warnings stay aligned under their bullet, long values such as `Available Detectors:` stay aligned under their column, and config messages remain readable at narrow terminal widths.

## [0.4.0] - 2026-07-30

### Changed

- **Breaking:** Pi 0.79.7 is now the supported minimum. Users on older Pi versions should pin `pi-theme-sync@0.3.x`.
- Terminal appearance now comes from Pi's color-scheme API. The Status overlay's `Detection Strategy:` values are now `Terminal Color Scheme` and `Terminal Color Scheme (subscription)`.
- Installing on an older Pi is not blocked. Detection falls back to OSC 11 and system appearance, and `/theme-sync` → Status names the host Pi version and the reason.

### Removed

- The extension's raw DSR 996/997 polling detector and DEC mode 2031 notification listener. OSC 11 and system appearance detection remain as fallbacks.

## [0.3.1] - 2026-07-10

### Fixed

- Pi no longer crashes when you replace the current session (`/new`, `/fork`, `/clone`, `/resume`, or `/reload`) while theme sync is detecting the terminal or system appearance.

## [0.3.0] - 2026-05-12

### Changed

- **Breaking:** The extension now targets Pi published under the `@earendil-works` npm scope (Pi `0.74.0` and later). Pi has moved away from its old `@mariozechner` scope, and `pi-theme-sync` v0.3.0 will not load on Pi versions prior to `0.74.0`. Upgrade Pi to `0.74.0` or newer before upgrading this extension.

## [0.2.0] - 2026-03-20

### Added

- `/theme-sync` command that opens an interactive overlay menu with Config and Status options.
- `isSyncActive` configuration field to enable or disable ongoing theme synchronization (defaults to `true`).

### Changed

- Configuration changes now require `/reload` before taking effect.

## [0.1.0] - 2026-03-17

_Initial release._

[0.4.1]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.4.1
[0.4.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.4.0
[0.3.1]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.3.1
[0.3.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.3.0
[0.2.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.2.0
[0.1.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.1.0
