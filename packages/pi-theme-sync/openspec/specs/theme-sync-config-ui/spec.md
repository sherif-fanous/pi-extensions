# theme-sync-config-ui

## Purpose

Interactive configuration overlay for editing theme sync settings, selecting themes, validating input, and choosing write targets.

## Requirements

### Requirement: Theme sync opens config from a top-level menu

The extension SHALL expose `/theme-sync` as a top-level interactive entrypoint.

#### Scenario: Theme sync menu shows bare config option

- **WHEN** the user runs `/theme-sync` in interactive mode
- **THEN** the extension shows a menu that includes `Config` and `Status` as options, supports arrow key wrapping (looping), and is dismissed by `Esc` or `Ctrl+C`

### Requirement: Theme sync config uses an overlay window

The extension SHALL open config inside a popup overlay window.

#### Scenario: Config opens in overlay

- **WHEN** the user selects `Config` from the `/theme-sync` menu
- **THEN** the extension opens a popup overlay configuration window

#### Scenario: Config overlay requires UI

- **WHEN** the user runs `/theme-sync` without interactive UI support
- **THEN** the extension reports that UI support is required

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

The extension SHALL validate `Polling Interval` inside the overlay before saving it.

#### Scenario: Accept valid polling interval

- **WHEN** the user enters a numeric polling interval greater than or equal to `1000`
- **THEN** the overlay accepts that value for saving

#### Scenario: Reject invalid polling interval in place

- **WHEN** the user enters a non-numeric polling interval or a numeric value less than `1000`
- **THEN** the overlay keeps the user in the config window and shows an inline validation error

### Requirement: Theme sync config overlay edits sync status

The extension SHALL let the user change sync status from the config overlay.

#### Scenario: Sync status can be set active

- **WHEN** the user edits `Sync Status` and chooses `active`
- **THEN** the overlay stages `isSyncActive = true` for saving

#### Scenario: Sync status can be set inactive

- **WHEN** the user edits `Sync Status` and chooses `inactive`
- **THEN** the overlay stages `isSyncActive = false` for saving

### Requirement: Theme sync config save flow asks where to write changes

The extension SHALL ask the user whether to write saved config changes to project or global config.

#### Scenario: Save chooses project write target

- **WHEN** the user saves config changes and chooses `Project (<path>)`
- **THEN** the extension writes the saved config changes to the project config file

#### Scenario: Save chooses global write target

- **WHEN** the user saves config changes and chooses `Global (<path>)`
- **THEN** the extension writes the saved config changes to the global config file

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
