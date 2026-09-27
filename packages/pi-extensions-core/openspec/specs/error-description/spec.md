# error-description Specification

## Purpose

Give Pi extensions one way to turn a thrown value into text they can show
the user, so every extension reports failures the same way without
redefining the same helper.

## Requirements

### Requirement: Thrown values are described as text

The package SHALL export a `describeError(error: unknown): string` function
that returns the `message` of an `Error` (including subclasses), and returns
`String(error)` for any other thrown value.

#### Scenario: An Error is thrown

- **WHEN** `describeError` receives an `Error` or an `Error` subclass
- **THEN** it returns that error's `message` unchanged

#### Scenario: A non-Error value is thrown

- **WHEN** `describeError` receives a value that is not an `Error`, such as a
  string, a number, `null`, or `undefined`
- **THEN** it returns the result of `String()` on that value

### Requirement: Descriptions carry no added punctuation

`describeError` SHALL NOT add or remove trailing punctuation, so callers can
embed the result mid-sentence and apply their own sentence ending.

#### Scenario: Message without a full stop

- **WHEN** `describeError` receives an `Error` whose message is `disk full`
- **THEN** it returns `disk full` with no full stop appended

#### Scenario: Message that already ends in punctuation

- **WHEN** `describeError` receives an `Error` whose message is `disk full.`
- **THEN** it returns `disk full.` unchanged

### Requirement: Helpers hold no module-level state

Every export of the package SHALL be stateless, because each installed
extension may load its own copy of the package.

#### Scenario: Two extensions load separate copies

- **WHEN** two extensions each load their own copy of the package and call
  `describeError` with the same value
- **THEN** both calls return the same text
