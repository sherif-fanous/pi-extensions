## MODIFIED Requirements

### Requirement: Theme sync provides on-demand inspection and configuration while remaining quiet by default

The extension SHALL remain visually quiet during normal operation until the user explicitly requests status or configuration UI.

#### Scenario: No status widget is shown by default

- **WHEN** the extension is active during a normal Pi session and the user has not opened the status overlay via `/theme-sync`
- **THEN** it does not render the status widget in the main interface

#### Scenario: Config and status are available from the top-level menu

- **WHEN** the extension is loaded in Pi
- **THEN** it exposes `/theme-sync` as a command that opens a menu with `Config` and `Status` options
