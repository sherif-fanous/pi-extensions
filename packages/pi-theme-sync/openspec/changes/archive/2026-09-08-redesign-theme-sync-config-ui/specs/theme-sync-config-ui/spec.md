## ADDED Requirements

### Requirement: Theme sync opens configuration directly

Theme sync SHALL make the configuration overlay the default interactive surface for `/theme-sync`.

#### Scenario: Bare command opens configuration

- **WHEN** the user runs `/theme-sync` in interactive TUI mode
- **THEN** theme sync opens the configuration overlay without first showing a Config and Status menu

### Requirement: Theme sync config uses complete window framing

Theme sync SHALL render every configuration view as a complete, width-safe window with plain borders, an ordinary accent title, section rules where content regions meet, and a footer contained inside the frame.

#### Scenario: Main config view uses a complete frame

- **WHEN** the main configuration view is rendered
- **THEN** its top, side, and bottom borders form a complete window, its title alone accents the frame header, and its complete footer appears inside the window without truncation when the terminal has enough width

#### Scenario: Nested config view keeps the same presentation

- **WHEN** the user opens theme selection, sync status selection, polling interval editing, or write-target selection
- **THEN** the nested view uses the same complete frame, title treatment, content padding, and contained footer as the main configuration view

#### Scenario: Frame fits the rendered width

- **WHEN** any configuration view renders styled text, wide characters, long values, or long paths
- **THEN** every output line fits the width assigned by Pi and the right border remains aligned

#### Scenario: Frame chrome remains visible within the height limit

- **WHEN** a configuration list contains more items than fit in the available terminal height
- **THEN** the view limits or scrolls its content while keeping the title, footer, and bottom border visible

### Requirement: Theme sync config errors use consistent presentation

Theme sync SHALL present configuration errors with complete framing and consistent semantic styling.

#### Scenario: Field validation error stays inline

- **WHEN** a field value fails validation
- **THEN** the error appears inside the current framed view in error styling and the user's draft remains available for correction

#### Scenario: Recoverable save error stays inline

- **WHEN** path resolution or configuration persistence returns a recoverable error
- **THEN** the error appears inside the configuration frame in error styling and the overlay remains open for retry

#### Scenario: Error dialog uses a complete frame

- **WHEN** a configuration action presents an error in a nested dialog
- **THEN** the dialog uses a complete plain border, semantic error styling, wrapped body text, and a contained dismissal footer

### Requirement: Polling interval editor exposes normal text-input focus

Theme sync SHALL give the polling interval editor a visible text cursor and preserve input focus while the editor is active.

#### Scenario: Polling editor receives focus

- **WHEN** the user opens Polling Interval for editing
- **THEN** the current numeric value appears in a focused single-line input with a visible editing cursor

#### Scenario: Leaving polling editor restores config focus

- **WHEN** the user confirms a valid polling interval or cancels editing
- **THEN** focus returns to the configuration view inside the same overlay flow

## MODIFIED Requirements

### Requirement: Theme sync config uses an overlay window

Theme sync SHALL open config inside a popup overlay window.

#### Scenario: Config opens in overlay

- **WHEN** the user runs `/theme-sync` in interactive TUI mode
- **THEN** theme sync opens a popup overlay configuration window directly

#### Scenario: Config overlay requires UI

- **WHEN** the user runs `/theme-sync` outside interactive TUI mode
- **THEN** theme sync reports that interactive TUI mode is required

### Requirement: Theme sync config overlay validates polling interval inline

Theme sync SHALL validate `Polling Interval` inside the overlay before saving it.

#### Scenario: Accept valid polling interval

- **WHEN** the user enters a numeric polling interval between `1000` and `60000`, inclusive
- **THEN** the overlay accepts that value for saving

#### Scenario: Reject invalid polling interval in place

- **WHEN** the user enters a non-numeric polling interval or a numeric value outside `1000` to `60000`, inclusive
- **THEN** the overlay keeps the user in the polling interval editor and shows an inline error-styled validation message

## REMOVED Requirements

### Requirement: Theme sync opens config from a top-level menu

**Reason**: Configuration becomes the primary `/theme-sync` surface, and status moves to a dedicated subcommand.

**Migration**: Run `/theme-sync` to open configuration directly or `/theme-sync status` to inspect runtime status.
