## MODIFIED Requirements

### Requirement: Theme sync prefers subscription updates when available

The extension SHALL use subscription-based updates when a supported subscription detector is available and sync is active.

#### Scenario: DEC mode 2031 is available while sync is active

- **WHEN** DEC mode 2031 support is detected and effective `isSyncActive` is `true`
- **THEN** the extension uses subscription-based updates and does not start polling-based detector update checks

#### Scenario: Subscription mode keeps configured theme mapping authoritative

- **WHEN** subscription-based updates are active, effective `isSyncActive` is `true`, and Pi's current theme no longer matches the configured mapping for the last known appearance
- **THEN** the extension re-applies the configured theme mapping without waiting for a new appearance-change event

### Requirement: Theme sync polls available polling detectors when subscription updates are unavailable

The extension SHALL poll available polling detectors in priority order when subscription-based updates are unavailable and sync is active.

#### Scenario: Subscription detector is unavailable while sync is active

- **WHEN** no supported subscription detector is available, one or more polling detectors are available, and effective `isSyncActive` is `true`
- **THEN** the extension polls available polling detectors in priority order using the configured polling interval

#### Scenario: Polled appearance falls back within one interval

- **WHEN** the first available polling detector does not return a concrete appearance during a polling cycle and a lower-priority available polling detector does while effective `isSyncActive` is `true`
- **THEN** the extension uses the lower-priority polling detector result for that cycle

## ADDED Requirements

### Requirement: Theme sync performs one-shot detection while inactive

The extension SHALL still determine current appearance for inspection when sync is inactive, without enforcing themes.

#### Scenario: Startup detection occurs while sync is inactive

- **WHEN** the extension starts with effective `isSyncActive = false`
- **THEN** it performs one-shot appearance detection without applying a theme or starting ongoing sync enforcement

#### Scenario: Runtime reactivation uses fresh detection

- **WHEN** effective `isSyncActive` changes from `false` to `true` during runtime
- **THEN** the extension performs a fresh appearance detection before resuming sync enforcement
