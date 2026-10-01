## MODIFIED Requirements

### Requirement: Theme sync performs one-shot detection while inactive

The extension SHALL still determine current appearance for inspection when sync
is inactive, without enforcing themes. When the extension defers to Pi's
light/dark theme pair, it SHALL NOT perform this detection.

#### Scenario: Startup detection occurs while sync is inactive

- **WHEN** the extension starts with effective `syncEnabled = false` and does
  not defer to Pi's theme pair
- **THEN** it performs one-shot appearance detection without applying a theme or
  starting ongoing sync enforcement

#### Scenario: No detection while deferring to Pi's theme pair

- **WHEN** the extension starts and defers to Pi's light/dark theme pair
- **THEN** it performs no appearance detection and sends no terminal query

#### Scenario: Runtime reactivation uses fresh detection

- **WHEN** effective `syncEnabled` changes from `false` to `true` during runtime
- **THEN** the extension performs a fresh appearance detection before resuming
  sync enforcement
