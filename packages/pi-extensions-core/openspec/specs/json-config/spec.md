# json-config Specification

## Purpose

Give Pi extensions one wording for the warnings about a configuration file they
ignore and one way to save it, so every extension tells the same failures apart
and never leaves a half-written configuration file behind.

## Requirements

### Requirement: Ignored configuration files are warned about in one wording

A config handle SHALL give a file it could not read the warning
`Could not read configuration at <path>: <message>. Ignored the file.`, a file
that is not valid JSON
`Configuration at <path> is not valid JSON: <message>. Ignored the file.`, and a
file whose top level is not an object other than `null` or an array
`Configuration at <path> must be a JSON object. Ignored the file.`. `<message>`
SHALL be the `describeError` text of the error, followed by a full stop unless
it already ends in `.`, `!`, or `?`, so the warning never contains two full
stops in a row.

#### Scenario: A file that could not be read

- **WHEN** reading `/a/config.json` fails with an `Error` whose message is
  `EACCES: denied`
- **THEN** its warning is
  `Could not read configuration at /a/config.json: EACCES: denied. Ignored the file.`

#### Scenario: An error message that already ends a sentence

- **WHEN** the error's message is `Permission denied.`
- **THEN** the warning contains `Permission denied. Ignored the file.` with
  exactly one full stop after `denied`

#### Scenario: A file that is not a JSON object

- **WHEN** a file holds a JSON array, `null`, or a string literal
- **THEN** its warning is
  `Configuration at <path> must be a JSON object. Ignored the file.`

### Requirement: Configuration files are written in one format, atomically

Every write through a config handle SHALL write the document as JSON indented by
two spaces and followed by one newline, by creating missing parent directories,
writing a temporary file beside the destination, syncing it, and renaming it
over the destination.

#### Scenario: A write succeeds

- **WHEN** a write completes
- **THEN** the destination holds exactly the new contents and no temporary file
  remains beside it

#### Scenario: A write fails before the rename

- **WHEN** a write fails after the temporary file is created
- **THEN** the call rejects with the failure, the destination still holds its
  previous contents, and the temporary file is removed

#### Scenario: Parent directories are missing

- **WHEN** a write goes to a path whose parent directories do not exist
- **THEN** it creates them and writes the file
