---
"@sherif-fanous/pi-extensions-core": minor
---

- Added: Add `describeError`, which turns a thrown value into text, and
  `describeErrorSentence`, which ends that text with a full stop
- Added: Add `isRecord`, which checks that a value is an object other than
  `null` or an array
- Added: Add `isNotFoundError`, which checks that a thrown value is a
  missing-file (`ENOENT`) error
- Added: Add `parseJsonObject`, which parses JSON text whose top level must be
  an object and reports invalid JSON apart from a non-object value
- Added: Add `unreadableConfigWarning` and `malformedConfigWarning`, which word
  the warning for a configuration file that could not be read, is not valid
  JSON, or is not a JSON object
- Added: Add `atomicWrite`, which replaces a file through a synced temporary
  file so readers never see a partial write
- Added: Add `writeJsonFile`, which writes a value atomically as
  two-space-indented JSON ending in a newline
- Added: Add `extensionConfigPath` and `projectConfigPath`, which locate an
  extension's file in Pi's agent directory and in a project
- Added: Add `createCommandReport`, which shows a command's report as a
  transcript entry in TUI mode and as a notification in other modes
- Added: Add `styleReport`, which styles a report's heading, labels, and
  warnings
- Added: Add `alignLabelRows`, which aligns `label value` rows on the longest
  label
- Added: Add `guardCommand` and `guardEvent`, which turn a failing command or
  event handler into an error notification with one wording across extensions
- Added: Add `notifyWarnings`, which shows the warnings one operation produced
  as one warning notification headed with the extension name and warning count
- Added: Add `notifyUsageWarning`, which answers an argument a command does not
  accept with one warning that lists the command's valid forms
- Added: Add `pluralize`, which writes a count followed by the noun in the
  matching number
- Added: Add `subcommandCompletions`, which completes a command's fixed
  subcommands on the first word and shows each one's description in Pi's
  description column
- Added: Add `isInteractiveTui`, which checks that Pi runs its interactive
  terminal UI
- Added: Add `requireInteractiveTui`, which lets a command that opens an overlay
  run only in the interactive terminal UI and shows one warning in other modes
- Added: Add `overlayOptions` and `overlayMaxHeight`, which give every overlay
  one of two sizes, main or nested, and the height it lays itself out to
- Added: Add `renderFrame`, `frameTop`, `frameLine`, `frameSegment`,
  `frameBodyWidth`, `frameBodyRows`, and `padToWidth`, which draw the family's
  bordered frame with the title in the top border and a dim footer, fitted to
  any width
- Added: Add `keyHint`, `keyText`, `formatKeyId`, and `wrapKeyHints`, which
  write footer key hints with the keys the user actually has bound and wrap them
  between hints instead of cutting one
- Added: Add `matchSelectAction`, which reads list keys from Pi's `tui.select.*`
  keybindings, so remaps replace the default keys
- Added: Add `matchesHelpKey`, which recognizes F1 for a form's help, including
  the Kitty keyboard protocol encodings that `matchesKey` misses
- Added: Add `moveListSelection`, `listWindow`, and `listPosition`, which give
  every list the same movement, scrolling, and `(n/m)` position
- Added: Add `scrollLines`, which scrolls a text body with `↑` and `↓` edge
  markers
- Added: Add `emptyStateLines`, which draws an empty or no-match state as muted
  text
- Added: Add `loadConfigFiles` and `readConfigFile`, which read an extension's
  `config.json` in each scope into a `loaded`, `missing`, `invalid`, or
  `untrusted` state, skip a project file Pi does not trust, and ignore a file
  with another `version`
- Added: Add `configFilePath`, `configScopeLabel`, and `configFileWarnings`,
  which locate the file, label its scope `User` or `Project`, and collect the
  warnings to show once
- Added: Add `renameConfigKeys` and `migrateRenamedConfigKeys`, which read a
  renamed key under its old name and rewrite the file with the new one
- Added: Add `updateConfigFile` and `writeConfigFile`, which save with the
  current `version` first and refuse to overwrite an invalid file or save to an
  untrusted project
- Added: Add `configStatusLines`, which writes the `Config:` block of a status
  report
- Added: Add `configMigratedMessage`, `untrustedProjectConfigWarning`, and
  `unsupportedConfigVersionWarning`, which word the migration message and the
  new warnings
