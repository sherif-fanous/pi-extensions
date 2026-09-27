# theme-sync-status

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
  sync active state, detection strategy, available detection methods, polling
  interval, last update time, last event summary, and warnings when present

#### Scenario: Polling strategy identifies concrete detector

- **WHEN** polling-based detection is active
- **THEN** the report identifies the concrete polling detector rather than only
  a generic polling label

#### Scenario: Status omits config provenance

- **WHEN** the status report is rendered
- **THEN** it does not show config-source reporting
