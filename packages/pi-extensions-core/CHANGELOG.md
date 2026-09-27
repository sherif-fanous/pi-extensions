# Changelog

## [Unreleased]

### Added

- `describeError`, which turns a thrown value into text.
- `isRecord`, which checks that a value is an object other than `null` or an
  array.
- `isNotFoundError`, which checks that a thrown value is a missing-file
  (`ENOENT`) error.
- `parseJsonObject`, which parses JSON text whose top level must be an object
  and reports invalid JSON apart from a non-object value.
- `unreadableConfigWarning` and `malformedConfigWarning`, which word the warning
  for a configuration file that could not be read, is not valid JSON, or is not
  a JSON object.
- `atomicWrite`, which replaces a file through a synced temporary file so
  readers never see a partial write.
- `writeJsonFile`, which writes a value atomically as two-space-indented JSON
  ending in a newline.
- `extensionConfigPath` and `projectConfigPath`, which locate an extension's
  file in Pi's agent directory and in a project.
- `createCommandReport`, which shows a command's report as a transcript entry in
  TUI mode and as a notification in other modes.
- `styleReport`, which styles a report's heading, labels, and warnings.
- `alignLabelRows`, which aligns `label value` rows on the longest label.
- `guardCommand` and `guardEvent`, which turn a failing command or event handler
  into an error notification with one wording across extensions.
- `notifyWarnings`, which shows the warnings one operation produced as one
  warning notification headed with the extension name and warning count.
- `subcommandCompletions`, which completes a command's fixed subcommands on the
  first word.
- `isInteractiveTui`, which checks that Pi runs its interactive terminal UI.
- `requireInteractiveTui`, which lets a command that opens an overlay run only
  in the interactive terminal UI and shows one warning in other modes.
