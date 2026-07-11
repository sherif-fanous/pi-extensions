# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

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

[0.3.1]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.3.1
[0.3.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.3.0
[0.2.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.2.0
[0.1.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.1.0
