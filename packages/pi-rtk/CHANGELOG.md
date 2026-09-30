# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.7.0] - 2026-09-29

### Changed

- Show the real state in the footer: dim `RTK: on` while rewriting is on and the
  rtk binary runs, dim `RTK: off` while rewriting is off, and `RTK: unavailable`
  in the warning color when the rtk binary is missing from PATH or can't run.
  The footer used to show a green `rtk ✓` even when rtk was missing
- Show `/rtk status` as an RTK Status report in the transcript, with aligned
  `Rewriting:`, `Binary:`, and `Tip:` rows, that stays after a reload. Outside
  the TUI the same report arrives as a notification
- Show the `/rtk status` report for a bare `/rtk` in print and JSON mode, which
  have no menu, instead of doing nothing
- Title the bare `/rtk` menu with the current state, and describe `/rtk` and
  each subcommand in its completions
- Answer an unknown `/rtk` subcommand with a warning that lists the valid forms
- Show a failure in `/rtk` or in RTK's startup or shell-command handling as one
  RTK error notification, and run a `!<cmd>` command unchanged when its rewrite
  fails
- Head the warning about an unreachable rtk binary with RTK
- Update `@sherif-fanous/pi-extensions-core` to 0.1.0

### Fixed

- Warn about an unreachable rtk binary and update the RTK footer badge after
  `/new`, `/resume`, or `/fork`, instead of showing an RTK error
- Describe `/rtk enable` and `/rtk disable` as lasting until Pi restarts, which
  they always did, instead of for the current session
- Warn when the rtk binary becomes unreachable again after `/new`, `/resume`, or
  `/fork` found it working, instead of staying silent because RTK had already
  warned about the earlier outage

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

[0.7.0]:
  https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-rtk%400.7.0
[0.6.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.6.0
[0.5.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.5.0
[0.4.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.4.0
[0.3.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.3.0
[0.2.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.2.0
[0.1.0]: https://github.com/sherif-fanous/pi-rtk/releases/tag/v0.1.0
