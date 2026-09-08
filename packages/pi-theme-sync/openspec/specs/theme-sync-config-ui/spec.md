# theme-sync-config-ui

## Purpose

Interactive configuration overlay for editing theme sync settings, selecting themes, validating input, and choosing write targets.

## Requirements

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

### Requirement: Theme sync config uses an overlay window

Theme sync SHALL open config inside a popup overlay window.

#### Scenario: Config opens in overlay

- **WHEN** the user runs `/theme-sync` in interactive TUI mode
- **THEN** theme sync opens a popup overlay configuration window directly

#### Scenario: Config overlay requires UI

- **WHEN** the user runs `/theme-sync` outside interactive TUI mode
- **THEN** theme sync reports that interactive TUI mode is required

### Requirement: Theme sync config overlay owns its editing flow

The extension SHALL keep editing interactions inside the overlay flow rather than returning focus to the prompt for nested editing dialogs.

#### Scenario: Enter keeps focus in overlay

- **WHEN** the user activates a config field from the overlay
- **THEN** the editing interaction remains inside the overlay flow

#### Scenario: Escape during editing returns within overlay flow

- **WHEN** the user cancels an in-progress config edit with `Esc`
- **THEN** the extension returns to the config overlay instead of leaving an orphaned overlay behind

### Requirement: Theme sync config overlay edits supported settings

The extension SHALL let the user edit the agreed configuration settings from the config overlay.

#### Scenario: Config overlay fresh-reads config on open

- **WHEN** the user opens the config overlay
- **THEN** the extension rereads supported config files from disk and populates the overlay from current on-disk values

#### Scenario: Config overlay lists editable settings

- **WHEN** the config overlay is shown
- **THEN** it offers `Light Mode Theme`, `Dark Mode Theme`, `Polling Interval`, and `Sync Status`

### Requirement: Theme sync config overlay selects theme mappings from available Pi themes

The extension SHALL use Pi theme selection UI inside the overlay flow to edit light and dark theme mappings.

#### Scenario: Light theme selection stays in overlay flow

- **WHEN** the user edits `Light Mode Theme`
- **THEN** the extension shows the currently available Pi theme names inside the overlay flow and lets the user choose one

#### Scenario: Dark theme selection stays in overlay flow

- **WHEN** the user edits `Dark Mode Theme`
- **THEN** the extension shows the currently available Pi theme names inside the overlay flow and lets the user choose one

### Requirement: Theme sync config overlay validates polling interval inline

Theme sync SHALL validate `Polling Interval` inside the overlay before saving it.

#### Scenario: Accept valid polling interval

- **WHEN** the user enters a numeric polling interval between `1000` and `60000`, inclusive
- **THEN** the overlay accepts that value for saving

#### Scenario: Reject invalid polling interval in place

- **WHEN** the user enters a non-numeric polling interval or a numeric value outside `1000` to `60000`, inclusive
- **THEN** the overlay keeps the user in the polling interval editor and shows an inline error-styled validation message

### Requirement: Theme sync config overlay edits sync status

The extension SHALL let the user change sync status from the config overlay.

#### Scenario: Sync status can be set active

- **WHEN** the user edits `Sync Status` and chooses `active`
- **THEN** the overlay stages `isSyncActive = true` for saving

#### Scenario: Sync status can be set inactive

- **WHEN** the user edits `Sync Status` and chooses `inactive`
- **THEN** the overlay stages `isSyncActive = false` for saving

### Requirement: Theme sync config save flow asks where to write changes

The extension SHALL ask the user whether to write saved config changes to project or global config. Each write-target label SHALL show the resolved destination for its scope using the same preferred-path and missing-only legacy fallback rules as configuration persistence. The extension SHALL resolve these labels from current filesystem state whenever the write-target view opens.

#### Scenario: Save chooses project write target

- **WHEN** the user saves config changes and chooses `Project (<path>)`
- **THEN** the extension writes the saved config changes to the project config file

#### Scenario: Save chooses global write target

- **WHEN** the user saves config changes and chooses `Global (<path>)`
- **THEN** the extension writes the saved config changes to the global config file

#### Scenario: Preferred destination is displayed

- **WHEN** a scope's preferred file exists or neither candidate exists
- **THEN** that scope's write-target label shows the full path to `theme-sync/settings.json` under its Pi directory

#### Scenario: Legacy destination is displayed

- **WHEN** a scope's preferred file is missing and its legacy file exists
- **THEN** that scope's write-target label shows the full path to the selected `theme-sync.json` file

#### Scenario: Write targets resolve independently

- **WHEN** one scope selects a preferred destination and the other selects a legacy destination
- **THEN** each label shows its own resolved destination, including the custom global agent directory when configured

#### Scenario: Reopening write targets reflects manual migration

- **WHEN** the user migrates config files and subsequently reopens the write-target view
- **THEN** the labels reflect the current selected paths rather than previously displayed paths

### Requirement: Theme sync config overlay shows config provenance alongside settings

The extension SHALL surface where the effective config values come from in the config overlay rather than in the status overlay.

#### Scenario: Config overlay shows per-setting source context

- **WHEN** the config overlay is rendered
- **THEN** it shows source context for the editable settings using project/global/default terminology

### Requirement: Theme sync config overlay supports keyboard-driven editing

The extension SHALL provide keyboard-driven controls for editing and saving config changes.

#### Scenario: Config overlay supports navigation and activation

- **WHEN** the config overlay is open
- **THEN** the user can navigate rows or actions with `↑` and `↓` (supporting wrapping/looping) and activate the focused item with `Enter`

#### Scenario: Config overlay supports save and close shortcuts

- **WHEN** the config overlay is open
- **THEN** `Ctrl+S` saves pending edits (showing a "Saving..." indicator), `Esc` goes back or closes the overlay, and `Ctrl+C` quits the entire process

#### Scenario: Config overlay reload shortcut reloads Pi runtime

- **WHEN** the config overlay is open and the user presses `Ctrl+R`
- **THEN** the extension triggers Pi runtime reload explicitly

### Requirement: Theme sync config overlay preserves alignment when messages wrap

The extension SHALL render the config overlay's inline message line with a
hanging indent when it exceeds the available overlay width, so that continuation
lines align under the text column of the first line rather than at column 0.

#### Scenario: Wrapped inline message keeps its indent

- **WHEN** the config overlay shows an inline message (validation error, save result, or warning) that is wider than the available overlay width
- **THEN** each continuation line is indented to align under the start of the message text

#### Scenario: Message wrapping preserves severity styling

- **WHEN** a wrapped inline message is rendered
- **THEN** every rendered line carries the message's severity styling and the full message text remains readable
