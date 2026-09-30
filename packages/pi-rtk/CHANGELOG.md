# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.6.0] - 2026-05-13

### Changed

- Reuse the rewrite found while probing a `!<cmd>` shell command instead of
  running rtk again, so the command starts sooner
  ([#10](https://github.com/sherif-fanous/pi-rtk/pull/10))

### Added

- Add `/rtk enable` and `/rtk disable`, which turn rewriting on or off until Pi
  restarts, and `/rtk status`, which shows the state, the rtk binary's version
  and path, and how to skip rtk for one command. A bare `/rtk` opens a menu with
  the same actions ([#13](https://github.com/sherif-fanous/pi-rtk/pull/13))
- Add a footer badge that shows `rtk ✓` in green while rewriting is on and
  `rtk ✗` in red while it is off
  ([#13](https://github.com/sherif-fanous/pi-rtk/pull/13))
- Warn once per outage when the rtk binary can't be reached, at session start or
  when it disappears while Pi runs
  ([#12](https://github.com/sherif-fanous/pi-rtk/pull/12))

## [0.5.0] - 2026-05-12

### Changed

- **Breaking:** Require Pi 0.74.0 or later, which Pi publishes under the
  `@earendil-works` npm scope instead of `@mariozechner`

## [0.4.0] - 2026-05-12

### Fixed

- Apply rtk's rewrite to every shell command rtk rewrites, instead of only to
  `ls`, `grep`, `find`, `wc`, and `cat`
  ([#2](https://github.com/sherif-fanous/pi-rtk/issues/2))

## [0.3.0] - 2026-03-18

### Changed

- **Breaking:** Require Pi v0.60.0 or later and use Pi's exported
  `createLocalBashOperations()` helper for optimized `user_bash` handling

## [0.2.0] - 2026-03-15

### Added

- Rewrite shell commands you run with Pi's `!<cmd>` syntax, whose output goes
  into the context

## [0.1.0] - 2026-03-09

_Initial release._

[0.6.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.6.0
[0.5.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.5.0
[0.4.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.4.0
[0.3.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.3.0
[0.2.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.2.0
[0.1.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.1.0
