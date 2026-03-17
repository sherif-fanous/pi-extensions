# theme-sync-debugging

## Purpose

TBD

## Requirements

### Requirement: Theme sync remains visually quiet during normal operation

The extension SHALL not render persistent UI or command-driven diagnostics during normal operation in v1.

#### Scenario: No persistent UI is shown

- **WHEN** the extension is active during a normal Pi session
- **THEN** it does not render persistent status UI in the main interface

#### Scenario: No diagnostics command is exposed

- **WHEN** the extension is loaded in Pi
- **THEN** it does not add a diagnostic slash command in v1
