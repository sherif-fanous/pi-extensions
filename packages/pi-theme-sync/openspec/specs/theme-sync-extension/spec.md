# theme-sync-extension

## Purpose

Extension lifecycle, theme application, runtime state tracking, and reload-driven configuration flow.

## Requirements

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

### Requirement: Theme sync never uses a session context after session replacement

The extension SHALL NOT use a session `ctx` for detection or theme application
after that session has been replaced or reloaded. In-flight detection work and
its continuations MUST short-circuit before touching the replaced `ctx`, so a
session replacement (`/new`, `/fork`, `/clone`, `/resume`, `/reload`) that
occurs while detection is in flight never crashes Pi.

#### Scenario: In-flight polling result resolves after session replacement

- **WHEN** a polling detection was started before session replacement and its
  result resolves after the extension's `session_shutdown` cleanup has run
- **THEN** the extension discards the result without accessing the replaced
  `ctx` and without applying a theme

#### Scenario: Detection loop is interrupted by session replacement mid-pass

- **WHEN** the extension is iterating polling detectors and the session is
  replaced between two detector attempts
- **THEN** the extension stops the detection pass without invoking further
  detectors against the replaced `ctx` and without raising an unhandled
  rejection

#### Scenario: Buffered subscription notification arrives after session replacement

- **WHEN** a DEC mode 2031 subscription callback is dispatched for buffered
  terminal input after the extension's `session_shutdown` cleanup has removed
  the listener
- **THEN** the extension ignores the notification without accessing the
  replaced `ctx`

#### Scenario: Drift-corrector fires after session replacement

- **WHEN** the drift-corrector interval callback runs after the extension's
  `session_shutdown` cleanup has run
- **THEN** the extension performs no theme comparison or application against
  the replaced `ctx`

#### Scenario: Theme application encounters a replaced context

- **WHEN** theme application is reached with a session `ctx` that has already
  been replaced
- **THEN** the extension does not propagate the resulting failure as an
  uncaught exception and Pi continues running
