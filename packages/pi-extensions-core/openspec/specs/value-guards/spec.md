# value-guards Specification

## Purpose

Give Pi extensions one way to check parsed JSON for an object and to recognize a
missing-file error, so every extension makes the same checks without redefining
the same guards.

## Requirements

### Requirement: Objects are recognized apart from null and arrays

The package SHALL export an
`isRecord(value: unknown): value is Record<string, unknown>` function that
returns `true` when `typeof value` is `"object"`, the value is not `null`, and
the value is not an array, and returns `false` otherwise.

#### Scenario: A plain object

- **WHEN** `isRecord` receives a plain object
- **THEN** it returns `true`

#### Scenario: A class instance

- **WHEN** `isRecord` receives an instance of a class
- **THEN** it returns `true`

#### Scenario: An array, null, or a primitive

- **WHEN** `isRecord` receives an array, `null`, or a primitive such as a string
- **THEN** it returns `false`

### Requirement: Missing-file errors are recognized by code

The package SHALL export an `isNotFoundError(error: unknown): boolean` function
that returns `true` when the thrown value is an object whose `code` is
`"ENOENT"`, and returns `false` otherwise.

#### Scenario: Reading a file that does not exist

- **WHEN** `isNotFoundError` receives the error thrown by reading a file that
  does not exist
- **THEN** it returns `true`

#### Scenario: An object carrying the ENOENT code

- **WHEN** `isNotFoundError` receives a plain object whose `code` is `"ENOENT"`
- **THEN** it returns `true`

#### Scenario: Another file-system error

- **WHEN** `isNotFoundError` receives an error whose `code` is `"EACCES"`
- **THEN** it returns `false`

#### Scenario: A value that is not an object

- **WHEN** `isNotFoundError` receives a string or `null`
- **THEN** it returns `false`
