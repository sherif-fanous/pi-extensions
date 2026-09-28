# theme-sync-status Specification

## Purpose

Runtime status reporting for inspecting current theme sync state, detection
strategy, and warnings.

## Requirements

### Requirement: Theme sync status is a command report

Theme sync SHALL expose runtime status through `/theme-sync status` instead of
an interactive status overlay.

#### Scenario: Status subcommand produces a report in TUI mode

- **WHEN** the user runs `/theme-sync status` in interactive TUI mode
- **THEN** theme sync appends a durable themed status report to the transcript
  without opening an overlay

#### Scenario: Status subcommand reports outside TUI mode

- **WHEN** the user runs `/theme-sync status` outside interactive TUI mode and
  notification output is available
- **THEN** theme sync delivers the status report through a notification

#### Scenario: Status subcommand is discoverable

- **WHEN** the user requests argument completion after `/theme-sync`
- **THEN** Pi offers `status` with a short description

### Requirement: Theme sync status report uses semantic styling

Theme sync SHALL style status reports with an accent heading, muted field
labels, normal values, and warning-colored warning content.

#### Scenario: Report uses semantic styling

- **WHEN** the status report is rendered in the transcript
- **THEN** its heading uses accent styling, its field labels use muted styling,
  and warnings use warning styling

#### Scenario: Report aligns status fields

- **WHEN** the status report contains field labels of different lengths
- **THEN** each field row uses a two-space indent and aligns its value in one
  shared column

#### Scenario: Report remains readable when values wrap

- **WHEN** a status value or warning exceeds the available transcript width
- **THEN** Pi wraps the complete report content without losing any status
  information

### Requirement: Theme sync status overlay explains effective runtime state

Theme sync SHALL report the effective runtime state needed to explain current
behavior.

#### Scenario: Overlay shows status fields

- **WHEN** the user runs `/theme-sync status`
- **THEN** the report shows current appearance, applied theme, desired theme,
  sync state, detection strategy, available detection methods, polling interval,
  last update time, last event summary, the `Config:` block, and warnings when
  present

#### Scenario: Report words toggles and absent values the family way

- **WHEN** the status report is rendered
- **THEN** its heading is `Theme Sync Status`, its labels are in sentence case,
  as in `Applied theme:`, sync shows `on` or `off`, a desired theme that is not
  known shows `none`, a missing last update shows `never`, and warnings follow
  one `Warnings:` line as `- ` items

#### Scenario: Polling strategy identifies concrete detector

- **WHEN** polling-based detection is active
- **THEN** the report identifies the concrete polling detector rather than only
  a generic polling label

#### Scenario: Status shows each configuration file

- **WHEN** the status report is rendered after a session start
- **THEN** after the main rows and a blank line, and before `Warnings:`, it
  shows a `Config:` block with a `User:` and a `Project:` row, each with its
  file's state (`loaded`, `not found`, `invalid: <reason>`, or
  `skipped (untrusted)`) and the file's path on the next line
- **AND** a file problem shows only in that block, not again under `Warnings:`

### Requirement: Theme sync notifies setup warnings once

When session setup finishes, theme sync SHALL show every warning recorded during
that setup in one warning notification headed `Theme Sync: <n> warning(s)`, in
this order: migration, configuration file, invalid value, then detector
warnings. Setup without warnings, and a command that reads the configuration
again, SHALL NOT notify. Later warnings from the recurring detection cycle, and
warnings of a setup whose session ended first, SHALL NOT notify.

#### Scenario: Setup records warnings

- **WHEN** a session starts and its setup records one or more warnings
- **THEN** theme sync shows one warning notification listing each of them
- **AND** `/theme-sync status` lists the same warnings, except the file
  warnings, which its `Config:` block shows as file states

#### Scenario: A detection cycle records a warning later

- **WHEN** a recurring detection cycle records a new warning after setup
- **THEN** theme sync does not notify it
- **AND** `/theme-sync status` lists it

#### Scenario: The session ends during setup

- **WHEN** theme sync is cleaned up, by shutdown or a newer session start,
  before a setup finishes
- **THEN** that setup does not notify its warnings
