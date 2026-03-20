## MODIFIED Requirements

### Requirement: Theme sync applies mapped themes

The extension SHALL apply the configured light or dark Pi theme that corresponds to the currently resolved appearance when sync is active.

#### Scenario: Apply mapped light theme on startup when sync is active

- **WHEN** the extension starts, effective `isSyncActive` is `true`, and it resolves the current appearance as `light`
- **THEN** it applies the configured light theme mapping

#### Scenario: Apply mapped dark theme on startup when sync is active

- **WHEN** the extension starts, effective `isSyncActive` is `true`, and it resolves the current appearance as `dark`
- **THEN** it applies the configured dark theme mapping

#### Scenario: Update mapped theme after appearance change when sync is active

- **WHEN** the resolved appearance changes from `light` to `dark` or from `dark` to `light` while effective `isSyncActive` is `true`
- **THEN** the extension applies the configured theme mapping for the new appearance

## ADDED Requirements

### Requirement: Theme sync status remains available while inactive

The extension SHALL continue to expose runtime state for inspection while sync is inactive.

#### Scenario: Status reflects inactive sync

- **WHEN** effective `isSyncActive` is `false`
- **THEN** the extension can still report appearance, applied theme, desired theme, and inactive sync state in status output

### Requirement: Theme sync config changes do not alter the current runtime until reload

The extension SHALL keep the current runtime behavior unchanged after saving config until `/reload` is run.

#### Scenario: Saving inactive sync state does not immediately pause runtime

- **WHEN** the user saves `isSyncActive = false` from `/theme-sync config`
- **THEN** the current runtime continues using the previously loaded config until `/reload` is run

#### Scenario: Saving new theme mapping does not immediately change runtime

- **WHEN** the user saves a new light or dark theme mapping from `/theme-sync config`
- **THEN** the current runtime continues using the previously loaded mapping until `/reload` is run
