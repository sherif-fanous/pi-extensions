# theme-sync-extension

## Purpose

TBD

## Requirements

### Requirement: Theme sync applies mapped themes

The extension SHALL apply the configured light or dark Pi theme that corresponds to the currently resolved appearance.

#### Scenario: Apply mapped light theme on startup

- **WHEN** the extension starts and resolves the current appearance as `light`
- **THEN** it applies the configured light theme mapping

#### Scenario: Apply mapped dark theme on startup

- **WHEN** the extension starts and resolves the current appearance as `dark`
- **THEN** it applies the configured dark theme mapping

#### Scenario: Update mapped theme after appearance change

- **WHEN** the resolved appearance changes from `light` to `dark` or from `dark` to `light`
- **THEN** the extension applies the configured theme mapping for the new appearance

### Requirement: Theme sync avoids redundant theme changes

The extension SHALL avoid changing Pi themes when the resolved appearance changes but the mapped Pi theme is already active.

#### Scenario: Duplicate dark result does not change theme

- **WHEN** the extension receives a new `dark` result and the mapped dark theme is already active
- **THEN** it does not change the active Pi theme

### Requirement: Theme sync keeps configured theme mapping authoritative during runtime

The extension SHALL maintain the configured light or dark theme mapping as the active Pi theme for the last known appearance while the extension is running.

#### Scenario: Active theme drifts from configured mapping without an appearance change

- **WHEN** the last known appearance remains unchanged and Pi's active theme no longer matches the configured mapping for that appearance
- **THEN** the extension restores the configured theme mapping for that appearance
