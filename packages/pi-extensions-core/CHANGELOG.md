# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.1.0] - 2026-09-29

### Added

- Add `describeError`, which turns a thrown value into text, and
  `describeErrorSentence`, which ends that text with a full stop
- Add `isRecord`, which checks that a value is an object other than `null` or an
  array
- Add `isNotFoundError`, which checks that a thrown value is a missing-file
  (`ENOENT`) error
- Add `createCommandReport`, which shows a command's report as a transcript
  entry in TUI mode and as a notification in other modes
- Add `styleReport`, which styles a report's heading, labels, and warnings
- Add `formatReport`, which lays out a report body: the heading, rows aligned on
  the longest label, the `Config:` block, and the warnings
- Add `guardCommand`, which turns a failing command handler into an error
  notification, and `onEvent`, which registers an event handler that does the
  same, with one wording across extensions
- Add `notifyWarnings`, which shows the warnings one operation produced as one
  warning notification headed with the extension name and warning count
- Add `notifyUsageWarning`, which answers an argument a command does not accept
  with one warning that lists the command's valid forms
- Add `pluralize`, which writes a count followed by the noun in the matching
  number
- Add `subcommandCompletions`, which completes a command's fixed subcommands on
  the first word and shows each one's description in Pi's description column
- Add `isInteractiveTui`, which checks that Pi runs its interactive terminal UI
- Add `requireInteractiveTui`, which lets a command that opens an overlay run
  only in the interactive terminal UI and shows one warning in other modes
- Add `overlayOptions` and `overlayMaxHeight`, which give every overlay one of
  two sizes, main or nested, and the height it lays itself out to
- Add `getLiveTui`, which gets Pi's live TUI and its theme for an overlay or
  terminal API that `ctx.ui` does not offer, without drawing anything or moving
  focus
- Add `renderFrame`, `frameTop`, `frameLine`, `frameSegment`, `frameBodyWidth`,
  `frameBodyRows`, and `padToWidth`, which draw the family's bordered frame with
  the title in the top border and a dim footer, fitted to any width
- Add `layoutFramedSurface`, which lays out a framed dialog or form whose text
  scrolls: it picks the footer, shows a busy line in its place, and fits the
  overlay height
- Add `keyHint`, `keyText`, `formatKeyId`, and `wrapKeyHints`, which write
  footer key hints with the keys the user actually has bound and wrap them
  between hints instead of cutting one
- Add `matchSelectAction`, which reads list keys from Pi's `tui.select.*`
  keybindings, so remaps replace the default keys
- Add `matchesHelpKey`, which recognizes F1 for a form's help, including the
  Kitty keyboard protocol encodings that `matchesKey` misses
- Add `moveListSelection`, `listWindow`, and `listPosition`, which give every
  list the same movement, scrolling, and `(n/m)` position
- Add `scrollLines`, which scrolls a text body with `↑` and `↓` edge markers
- Add `emptyStateLines`, which draws an empty or no-match state as muted text
- Add `defineConfigFile`, which describes an extension's `config.json` once and
  returns a handle that reads, saves, and migrates each scope's file, skips a
  project file Pi does not trust, ignores a file with another `version`, and
  reads renamed keys under their old names
- Add the configuration outcome a load returns, which shows what a session start
  migrated and every configuration warning in one fixed order, and writes the
  `Config:` block of a status report
- Add `configScopeLabel`, which labels a scope `User` or `Project`

[0.1.0]:
  https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-extensions-core%400.1.0
