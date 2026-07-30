# theme-sync-detection

## Purpose

Appearance detection strategy selection, detector probing, subscription/polling lifecycle, and graceful degradation.
## Requirements
### Requirement: Theme sync determines current appearance from polling detectors in priority order

The extension SHALL determine current appearance by trying supported polling detectors in priority order.

#### Scenario: Current appearance resolves from higher-priority polling detector

- **WHEN** a higher-priority polling detector returns a concrete appearance
- **THEN** the extension uses that appearance without consulting lower-priority polling detectors for that detection pass

#### Scenario: Current appearance falls back to lower-priority polling detector

- **WHEN** a higher-priority polling detector does not return a concrete appearance and a lower-priority polling detector does
- **THEN** the extension uses the lower-priority polling detector result

### Requirement: Theme sync probes available polling and subscription detectors

The extension SHALL probe available polling detectors and available subscription detectors at startup.

#### Scenario: Polling detector is available

- **WHEN** a polling detector returns a concrete appearance during probing
- **THEN** the extension treats that polling detector as available

#### Scenario: Subscription detector is available

- **WHEN** a subscription detector reports support during probing
- **THEN** the extension treats that subscription detector as available

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

### Requirement: Theme sync degrades gracefully when a detection source cannot be used

The extension SHALL treat unsupported detection sources, unavailable inputs, and detection timeouts as non-fatal.

#### Scenario: Interactive-only detection source is unavailable

- **WHEN** a configured detection source requires capabilities that are not available in the current Pi mode
- **THEN** the extension skips that source and continues to fallback behavior

#### Scenario: Detection source times out

- **WHEN** a detection source does not produce a usable result within its timeout window
- **THEN** the extension treats that source result as unavailable and continues detection or fallback behavior

#### Scenario: Host does not expose the color-scheme API

- **WHEN** the host Pi does not expose a usable color-scheme API
- **THEN** the extension treats the color-scheme detector as unavailable and continues with its remaining detectors without raising an error

### Requirement: Theme sync performs one-shot detection while inactive

The extension SHALL still determine current appearance for inspection when sync is inactive, without enforcing themes.

#### Scenario: Startup detection occurs while sync is inactive

- **WHEN** the extension starts with effective `isSyncActive = false`
- **THEN** it performs one-shot appearance detection without applying a theme or starting ongoing sync enforcement

#### Scenario: Runtime reactivation uses fresh detection

- **WHEN** effective `isSyncActive` changes from `false` to `true` during runtime
- **THEN** the extension performs a fresh appearance detection before resuming sync enforcement

### Requirement: Theme sync sources terminal color-scheme reports from the host color-scheme API

The extension SHALL obtain terminal color-scheme reports through the host Pi's color-scheme API rather than by parsing raw terminal input, so that the host's own consumption of those reports cannot starve detection.

#### Scenario: Host consumes color-scheme reports before extension input listeners

- **WHEN** the host Pi consumes terminal color-scheme reports before dispatching data to extension terminal-input listeners
- **THEN** the extension still receives appearance results, because it reads them from the color-scheme API rather than from raw terminal input

#### Scenario: Color-scheme query resolves a concrete appearance

- **WHEN** a color-scheme query returns a concrete light or dark result
- **THEN** the extension uses that result as the detected appearance without parsing terminal input itself

#### Scenario: Color-scheme subscription reports an appearance change

- **WHEN** the host Pi reports a terminal color-scheme change while sync is active
- **THEN** the extension treats it as a new detected appearance and applies the configured theme mapping

#### Scenario: Subscription cleanup preserves the host notification channel

- **WHEN** the extension cleans up its color-scheme subscription while Pi's built-in automatic theme controller also uses terminal color-scheme notifications
- **THEN** the extension removes only its own listener and does not disable the host's shared terminal notification channel

