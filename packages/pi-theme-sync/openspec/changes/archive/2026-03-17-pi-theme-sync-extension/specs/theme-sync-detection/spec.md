## ADDED Requirements

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

The extension SHALL use subscription-based updates when a supported subscription detector is available.

#### Scenario: DEC mode 2031 is available

- **WHEN** DEC mode 2031 support is detected
- **THEN** the extension subscribes to terminal appearance updates and does not start polling-based detector update checks

#### Scenario: Subscription mode keeps configured theme mapping authoritative

- **WHEN** subscription-based updates are active and Pi's current theme no longer matches the configured mapping for the last known appearance
- **THEN** the extension re-applies the configured theme mapping without waiting for a new appearance-change event

### Requirement: Theme sync polls available polling detectors when subscription updates are unavailable

The extension SHALL poll available polling detectors in priority order when subscription-based updates are unavailable.

#### Scenario: Subscription detector is unavailable

- **WHEN** no supported subscription detector is available and one or more polling detectors are available
- **THEN** the extension polls available polling detectors in priority order using the configured polling interval

#### Scenario: Polled appearance falls back within one interval

- **WHEN** the first available polling detector does not return a concrete appearance during a polling cycle and a lower-priority available polling detector does
- **THEN** the extension uses the lower-priority polling detector result for that cycle

### Requirement: Theme sync degrades gracefully when a detection source cannot be used

The extension SHALL treat unsupported detection sources, unavailable inputs, and detection timeouts as non-fatal.

#### Scenario: Interactive-only detection source is unavailable

- **WHEN** a configured detection source requires capabilities that are not available in the current Pi mode
- **THEN** the extension skips that source and continues to fallback behavior

#### Scenario: Detection source times out

- **WHEN** a detection source does not produce a usable result within its timeout window
- **THEN** the extension treats that source result as unavailable and continues detection or fallback behavior
