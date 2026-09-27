# json-config Specification

## Purpose

Give Pi extensions one way to read a JSON configuration document that must be an
object, one wording for the warnings about a file they ignore, and one way to
save it, so every extension tells the same failures apart and never leaves a
half-written configuration file behind.

## Requirements

### Requirement: JSON object text is parsed into a tagged result

The package SHALL export a `parseJsonObject(text: string)` function that never
throws and returns `{ ok: true, value }` when the text parses as JSON and its
top level is an object other than `null` or an array,
`{ ok: false, reason: "invalid-json", error }` carrying the error `JSON.parse`
threw when the text is not valid JSON, and `{ ok: false, reason: "not-object" }`
when the text parses to any other value.

#### Scenario: Text holding a JSON object

- **WHEN** `parseJsonObject` receives the text of a JSON object
- **THEN** it returns `ok: true` with the parsed object as `value`

#### Scenario: Text that is not valid JSON

- **WHEN** `parseJsonObject` receives text that `JSON.parse` rejects
- **THEN** it returns `ok: false` with `reason` `"invalid-json"` and the thrown
  `SyntaxError` as `error`

#### Scenario: Text holding a JSON value that is not an object

- **WHEN** `parseJsonObject` receives the text of a JSON array, `null`, or a
  string literal
- **THEN** it returns `ok: false` with `reason` `"not-object"`

### Requirement: Ignored configuration files are warned about in one wording

The package SHALL export an `unreadableConfigWarning(path, error)` function that
returns `Could not read configuration at <path>: <message>. Ignored the file.`
and a `malformedConfigWarning(path, failure)` function that takes a failed
`parseJsonObject` result and returns
`Configuration at <path> is not valid JSON: <message>. Ignored the file.` for
`reason` `"invalid-json"` and
`Configuration at <path> must be a JSON object. Ignored the file.` for `reason`
`"not-object"`. `<message>` SHALL be the `describeError` text of the error,
followed by a full stop unless it already ends in `.`, `!`, or `?`, so the
warning never contains two full stops in a row.

#### Scenario: A file that could not be read

- **WHEN** `unreadableConfigWarning` receives the path `/a/config.json` and an
  `Error` with the message `EACCES: denied`
- **THEN** it returns
  `Could not read configuration at /a/config.json: EACCES: denied. Ignored the file.`

#### Scenario: An error message that already ends a sentence

- **WHEN** `unreadableConfigWarning` receives an `Error` whose message is
  `Permission denied.`
- **THEN** the warning contains `Permission denied. Ignored the file.` with
  exactly one full stop after `denied`

#### Scenario: A file that is not valid JSON

- **WHEN** `malformedConfigWarning` receives the path `/a/config.json` and an
  `invalid-json` failure whose error message is `Unexpected end of JSON input`
- **THEN** it returns
  `Configuration at /a/config.json is not valid JSON: Unexpected end of JSON input. Ignored the file.`

#### Scenario: A file that is not a JSON object

- **WHEN** `malformedConfigWarning` receives the path `/a/config.json` and a
  `not-object` failure
- **THEN** it returns
  `Configuration at /a/config.json must be a JSON object. Ignored the file.`

### Requirement: JSON files are written in one format

The package SHALL export a
`writeJsonFile(path: string, value: unknown): Promise<void>` function that
writes `value` as JSON indented by two spaces and followed by one newline, using
the atomic write.

#### Scenario: Writing a value

- **WHEN** `writeJsonFile` writes a value to a path whose parent directories do
  not exist
- **THEN** it creates the directories and the file contains
  `JSON.stringify(value, null, 2)` followed by a newline

### Requirement: Files are replaced atomically

The package SHALL export an
`atomicWrite(target: string, contents: string): Promise<void>` function that
creates missing parent directories, writes the contents to a temporary file
beside the destination, syncs it, and renames it over the destination.
`atomicWrite` and `writeJsonFile` SHALL accept an optional file-system seam so
tests can simulate failures.

#### Scenario: A write succeeds

- **WHEN** `atomicWrite` completes
- **THEN** the destination holds exactly the new contents and no temporary file
  remains beside it

#### Scenario: A write fails before the rename

- **WHEN** a write fails after the temporary file is created
- **THEN** the call rejects with the failure, the destination still holds its
  previous contents, and the temporary file is removed

#### Scenario: Parent directories are missing

- **WHEN** `atomicWrite` writes to a path whose parent directories do not exist
- **THEN** it creates them and writes the file
