# command-reports Specification

## Purpose

Give Pi extensions one way to show the plain-text report a command produces: a
styled transcript entry in TUI mode that survives a reload, and a notification
in every other mode, so every extension's reports look alike without each one
redefining the delivery, rendering, and styling.

## Requirements

### Requirement: Report bodies are styled by one set of rules

The package SHALL export a `styleReport(body, theme)` function that styles each
line of a plain report body:

- The first line is the heading and SHALL be bold and accent-colored.
- A line that is exactly `Warnings:`, and every line after it, SHALL be
  warning-colored.
- Any other line matching `label: value`, where the first colon is followed by
  whitespace or ends the line, SHALL keep its leading whitespace and render the
  text up to and including that colon muted, leaving the rest unchanged.
- Every remaining line SHALL be returned unchanged.

#### Scenario: The heading

- **WHEN** `styleReport` styles a body
- **THEN** its first line is bold and accent-colored, whatever it contains

#### Scenario: A label row

- **WHEN** a line after the heading, and before any `Warnings:` line, contains a
  colon
- **THEN** the text up to and including the first colon is muted
- **AND** the leading whitespace and the text after the colon are unchanged

#### Scenario: A colon inside a word

- **WHEN** a line after the heading, and before any `Warnings:` line, has its
  first colon followed by a character other than whitespace, such as `C:\Users`
  or `team:plan`
- **THEN** it is returned unchanged

#### Scenario: A warnings section

- **WHEN** a body contains a `Warnings:` line
- **THEN** that line and every line after it are warning-colored, including
  lines that contain a colon

#### Scenario: A line without a label

- **WHEN** a line after the heading, and before any `Warnings:` line, contains
  no colon
- **THEN** it is returned unchanged

### Requirement: Label rows are aligned

The package SHALL export an `alignLabelRows(rows)` function that turns
`[label, value]` pairs into lines of the form `  <label><padding> <value>`,
where the padding brings every label to the length of the longest label in
`rows`.

#### Scenario: Labels of different lengths

- **WHEN** `alignLabelRows` receives labels of different lengths
- **THEN** every line starts with two spaces
- **AND** every value starts in the same column, one space after the longest
  label

### Requirement: Reports are delivered by mode

The package SHALL export a `createCommandReport(entryType)` function returning
the `entryType` and `deliver`, `render`, and `register` functions for reports of
the form `{ body, severity? }`, where `severity` is `info` or `warning` and
defaults to `info`. The body SHALL be stored and passed as plain text.

#### Scenario: TUI mode

- **WHEN** `deliver` is called in TUI mode
- **THEN** it appends the report as a custom entry of type `entryType`
- **AND** it does not notify

#### Scenario: Other modes

- **WHEN** `deliver` is called in any mode other than TUI
- **THEN** it notifies once with the body styled by `styleReport` using the
  current theme, at the report's severity, or `info` when the report sets none
- **AND** it does not append an entry

### Requirement: Stored reports render with the current theme

`render` SHALL render a stored report entry as text styled by `styleReport` with
the theme it is rendered with, and `register` SHALL register `render` as the
entry renderer for `entryType`, so reports restored from a session render with
the theme active at that time.

#### Scenario: Rendering a stored entry

- **WHEN** `render` receives a stored report entry and a theme
- **THEN** it returns a component showing the entry's body styled by
  `styleReport` with that theme

#### Scenario: Registering the renderer

- **WHEN** `register` is called with the extension API
- **THEN** it registers `render` as the entry renderer for `entryType`
