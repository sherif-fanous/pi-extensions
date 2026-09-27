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
- `atomicWrite`, which replaces a file through a synced temporary file so
  readers never see a partial write.
- `writeJsonFile`, which writes a value atomically as two-space-indented JSON
  ending in a newline.
- `extensionConfigPath` and `projectConfigPath`, which locate an extension's
  file in Pi's agent directory and in a project.
