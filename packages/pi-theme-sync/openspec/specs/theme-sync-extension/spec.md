# theme-sync-extension Specification

## Purpose

Extension lifecycle, theme application, runtime state tracking, and
reload-driven configuration flow.

## Requirements

### Requirement: Theme sync applies mapped themes

The extension SHALL apply the configured light or dark Pi theme that corresponds
to the currently resolved appearance when sync is active.

#### Scenario: Apply mapped light theme on startup when sync is active

- **WHEN** the extension starts, effective `syncEnabled` is `true`, and it
  resolves the current appearance as `light`
- **THEN** it applies the configured light theme mapping

#### Scenario: Apply mapped dark theme on startup when sync is active

- **WHEN** the extension starts, effective `syncEnabled` is `true`, and it
  resolves the current appearance as `dark`
- **THEN** it applies the configured dark theme mapping

#### Scenario: Update mapped theme after appearance change when sync is active

- **WHEN** the resolved appearance changes from `light` to `dark` or from `dark`
  to `light` while effective `syncEnabled` is `true`
- **THEN** the extension applies the configured theme mapping for the new
  appearance

### Requirement: Theme sync avoids redundant theme changes

The extension SHALL avoid changing Pi themes when the resolved appearance
changes but the mapped Pi theme is already active.

#### Scenario: Duplicate dark result does not change theme

- **WHEN** the extension receives a new `dark` result and the mapped dark theme
  is already active
- **THEN** it does not change the active Pi theme

### Requirement: Theme sync keeps configured theme mapping authoritative during runtime

The extension SHALL maintain the configured light or dark theme mapping as the
active Pi theme for the last known appearance while the extension is running.

#### Scenario: Active theme drifts from configured mapping without an appearance change

- **WHEN** the last known appearance remains unchanged and Pi's active theme no
  longer matches the configured mapping for that appearance
- **THEN** the extension restores the configured theme mapping for that
  appearance
- **AND** the status report's last event reads
  `Drift corrected: reapplied <appearance> theme`, whether detection polls or
  uses a subscription

#### Scenario: Poll finds the same appearance

- **WHEN** a detection cycle finds the last known appearance and Pi's active
  theme still matches its mapping
- **THEN** the extension changes nothing, and the status report's last update
  and last event stay as they were

### Requirement: Theme sync status remains available while inactive

The extension SHALL continue to expose runtime state for inspection while sync
is inactive.

#### Scenario: Status reflects inactive sync

- **WHEN** effective `syncEnabled` is `false`
- **THEN** the extension can still report appearance, applied theme, desired
  theme, and inactive sync state in status output

### Requirement: Theme sync config changes do not alter the current runtime until reload

The extension SHALL keep the current runtime behavior unchanged after saving
config until `/reload` is run.

#### Scenario: Saving inactive sync state does not immediately pause runtime

- **WHEN** the user saves `syncEnabled = false` from `/theme-sync`
- **THEN** the current runtime continues using the previously loaded config
  until `/reload` is run

#### Scenario: Saving new theme mapping does not immediately change runtime

- **WHEN** the user saves a new light or dark theme mapping from `/theme-sync`
- **THEN** the current runtime continues using the previously loaded mapping
  until `/reload` is run

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

- **WHEN** a color-scheme subscription callback is dispatched for a buffered
  terminal color-scheme report after the extension's `session_shutdown` cleanup
  has unsubscribed the listener
- **THEN** the extension ignores the notification without accessing the replaced
  `ctx`

#### Scenario: Drift-corrector fires after session replacement

- **WHEN** the drift-corrector interval callback runs after the extension's
  `session_shutdown` cleanup has run
- **THEN** the extension performs no theme comparison or application against the
  replaced `ctx`

#### Scenario: Theme application encounters a replaced context

- **WHEN** theme application is reached with a session `ctx` that has already
  been replaced
- **THEN** the extension does not propagate the resulting failure as an uncaught
  exception and Pi continues running

### Requirement: Theme sync announces its deprecation

At every session start where Theme Sync does not defer to Pi's theme pair, the
extension SHALL record a deprecation notice as a setup warning. The notice SHALL
read
`Theme Sync is deprecated because Pi now switches themes itself. Set "theme": "<light>/<dark>" in Pi's settings.json, then run pi remove npm:@sherif-fanous/pi-theme-sync.`,
where `<light>` and `<dark>` are the effective light and dark theme mappings
after the Project file, the User file, and the defaults are merged. The notice
SHALL appear whether effective `syncEnabled` is `true` or `false`.

#### Scenario: Notice uses the effective theme mapping

- **GIVEN** the effective light theme is `catppuccin-latte` and the effective
  dark theme is `catppuccin-macchiato`
- **WHEN** a session starts and Pi's theme setting is not a light/dark pair
- **THEN** the setup warnings include
  `Theme Sync is deprecated because Pi now switches themes itself. Set "theme": "catppuccin-latte/catppuccin-macchiato" in Pi's settings.json, then run pi remove npm:@sherif-fanous/pi-theme-sync.`

#### Scenario: Notice uses the default mapping without configuration

- **GIVEN** neither configuration file exists
- **WHEN** a session starts and Pi's theme setting is not a light/dark pair
- **THEN** the notice names `"theme": "light/dark"`

#### Scenario: Notice appears while sync is off

- **GIVEN** effective `syncEnabled` is `false`
- **WHEN** a session starts and Pi's theme setting is not a light/dark pair
- **THEN** the setup warnings include the deprecation notice
- **AND** the extension behaves as it does with sync off, without applying a
  theme

#### Scenario: Sync keeps working after the notice

- **GIVEN** effective `syncEnabled` is `true`
- **WHEN** a session starts and Pi's theme setting is not a light/dark pair
- **THEN** the extension detects the appearance and applies the mapped theme as
  it did before this change

### Requirement: Theme sync defers to Pi's light/dark theme pair

When Pi exposes its effective settings to extensions and the effective `theme`
setting is a light/dark pair, the extension SHALL NOT probe detectors, poll,
subscribe to appearance reports, or change Pi's theme for that session. A
light/dark pair is a value with exactly one `/` and a non-empty theme name,
after trimming, on each side. Instead of the deprecation notice, the extension
SHALL record one setup warning reading
`Theme Sync is deprecated and is not changing themes because Pi's theme setting "<value>" already follows the terminal. Run pi remove npm:@sherif-fanous/pi-theme-sync to uninstall it.`,
where `<value>` is the setting as Pi reports it. The deferral SHALL apply
whatever the effective `syncEnabled` is. When Pi does not expose its settings,
or reading them fails, the extension SHALL behave as though the setting is not a
pair.

#### Scenario: Pi's theme setting is a pair

- **GIVEN** Pi reports the effective theme setting
  `catppuccin-latte/catppuccin-macchiato`
- **WHEN** a session starts with effective `syncEnabled` `true`
- **THEN** the extension sends no terminal query and does not call Pi's theme
  setter
- **AND** the setup warnings contain the deferral notice naming
  `catppuccin-latte/catppuccin-macchiato` and not the deprecation notice

#### Scenario: Pi's theme setting is a single theme

- **GIVEN** Pi reports the effective theme setting `dark`, or no theme setting
- **WHEN** a session starts
- **THEN** the extension does not defer and records the deprecation notice

#### Scenario: Pi's theme setting is not a valid pair

- **GIVEN** Pi reports a theme setting with two `/` characters, or with an empty
  side such as `light/`
- **WHEN** a session starts
- **THEN** the extension does not defer

#### Scenario: Pi does not expose its settings

- **GIVEN** the host Pi does not offer the settings reader, or the reader throws
- **WHEN** a session starts
- **THEN** the extension does not defer, raises no error, and records the
  deprecation notice

#### Scenario: Status while deferring

- **GIVEN** the extension deferred to Pi's theme pair
- **WHEN** the user runs `/theme-sync status`
- **THEN** the report shows sync `off`, appearance `unknown`, desired theme
  `none`, detection strategy `Inactive`, and last event
  `Deferred to Pi's theme setting`
- **AND** it lists the deferral notice under `Warnings:`
