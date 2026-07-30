# theme-sync-status

## Purpose

Runtime status overlay for inspecting current theme sync state, detection strategy, and warnings.

## Requirements

### Requirement: Theme sync opens status from a top-level menu

The extension SHALL expose `/theme-sync` as a top-level interactive entrypoint.

#### Scenario: Theme sync menu shows bare status option

- **WHEN** the user runs `/theme-sync` in interactive mode
- **THEN** the extension shows a menu that includes `Status` as a bare option label

### Requirement: Theme sync status uses an overlay window

The extension SHALL open status inside a popup overlay window.

#### Scenario: Status opens in overlay

- **WHEN** the user selects `Status` from the `/theme-sync` menu
- **THEN** the extension opens a popup overlay status window

#### Scenario: Status overlay requires UI

- **WHEN** the user runs `/theme-sync` without interactive UI support
- **THEN** the extension reports that UI support is required

### Requirement: Theme sync status overlay remains visible until dismissed

The extension SHALL keep the status overlay visible until the user dismisses it.

#### Scenario: Overlay persists after opening

- **WHEN** the user opens the status overlay
- **THEN** the overlay remains visible until dismissed

#### Scenario: Overlay can be dismissed with keyboard input

- **WHEN** the user presses `Esc` while the status overlay is focused
- **THEN** the extension returns to the top-level menu

### Requirement: Theme sync status overlay explains effective runtime state

The extension SHALL show the effective runtime state needed to explain current behavior.

#### Scenario: Overlay shows status fields

- **WHEN** the status overlay is rendered
- **THEN** it shows current appearance, applied theme, desired theme, sync active state, detection strategy, available detection methods, polling interval, last update time, last event summary, and warnings when present

#### Scenario: Polling strategy identifies concrete detector

- **WHEN** polling-based detection is active
- **THEN** the status overlay identifies the concrete polling detector rather than only a generic polling label

#### Scenario: Status omits config provenance

- **WHEN** the status overlay is rendered
- **THEN** it does not show config-source reporting

### Requirement: Theme sync status overlay preserves alignment when text wraps

The extension SHALL render status overlay text that exceeds the available
overlay width with a hanging indent, so that continuation lines align under the
text column of their first line rather than at column 0.

#### Scenario: Wrapped warning aligns under its bullet

- **WHEN** the status overlay renders a warning whose bulleted line is wider than the available overlay width
- **THEN** each continuation line is indented to align under the text following the bullet marker

#### Scenario: Wrapped status value aligns under its value column

- **WHEN** the status overlay renders a label/value row whose value is wider than the available overlay width
- **THEN** each continuation line is indented to align under the value column, leaving the label column of continuation lines blank

#### Scenario: Wrapping adapts to the rendered width

- **WHEN** the status overlay is rendered at a width narrower than its preferred width
- **THEN** wrapping and hanging indentation are computed for the actual rendered width, and no content is truncated or lost

#### Scenario: Short lines are unchanged

- **WHEN** the status overlay renders text that fits within the available overlay width
- **THEN** the text is rendered on a single line with no added indentation
