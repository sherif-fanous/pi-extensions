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

The extension SHALL use subscription-based updates when a supported subscription detector is available and sync is active, for as long as that subscription continues to report appearance changes.

#### Scenario: DEC mode 2031 is available while sync is active

- **WHEN** DEC mode 2031 support is detected and effective `isSyncActive` is `true`
- **THEN** the extension uses subscription-based updates and does not start polling-based detector update checks

#### Scenario: Subscription mode keeps configured theme mapping authoritative

- **WHEN** subscription-based updates are active, effective `isSyncActive` is `true`, and Pi's current theme no longer matches the configured mapping for the last known appearance
- **THEN** the extension re-applies the configured theme mapping without waiting for a new appearance-change event

#### Scenario: Subscription mode re-queries the full polling detector chain

- **WHEN** subscription-based updates are active and the extension performs its periodic re-query of current appearance
- **THEN** it tries available polling detectors in priority order rather than only the highest-priority polling detector, so that a host answering only a lower-priority detector still yields a concrete appearance

### Requirement: Theme sync stops trusting a subscription that misses an appearance change

An advertised subscription detector is not necessarily a functional one: a host may recognize the subscription mode without ever emitting reports for it. When polling observes an appearance change first, the extension SHALL allow the active subscription until the next polling cycle to report any appearance. If no report arrives in that window, the extension SHALL treat that single missed change as proof that the subscription is non-functional and fall back to polling detectors for the remainder of the session.

#### Scenario: Polling observes a change the subscription never reports

- **WHEN** subscription-based updates are active, a periodic re-query resolves a concrete appearance that differs from the last known appearance, and the subscription reports no appearance before the next polling cycle
- **THEN** the extension stops treating the subscription as its detection source and continues determining appearance from available polling detectors in priority order

#### Scenario: Subscription wins a race with polling

- **WHEN** a periodic re-query observes an appearance change before the active subscription callback runs, but the subscription reports an appearance before the next polling cycle
- **THEN** the extension retains the subscription detector and does not report it as non-functional

#### Scenario: Appearance changes twice within one polling cycle

- **WHEN** a periodic re-query observes one appearance, the appearance changes again before the next polling cycle, and the subscription reports only the newer appearance
- **THEN** the extension retains the subscription detector, because any report establishes that the notification channel is live

#### Scenario: Subscription that reports changes is retained

- **WHEN** an active subscription reports appearance changes and no polling-observed change goes unreported through a full polling cycle
- **THEN** the extension continues to use subscription-based updates and does not fall back to polling-based detector update checks

#### Scenario: Demotion preserves the host notification channel

- **WHEN** the extension stops trusting a non-functional subscription
- **THEN** it removes only its own listener and does not disable the host's shared terminal notification channel

### Requirement: Theme sync reports a demoted subscription in its status surface

The extension SHALL make a demoted subscription visible rather than continuing to present the session as subscription-driven.

#### Scenario: Detection strategy reports the detector that answered

- **WHEN** a subscription has been demoted and appearance is being resolved by a polling detector
- **THEN** the reported detection strategy identifies that concrete polling detector rather than the subscription detector

#### Scenario: Demoted subscription is no longer advertised as available

- **WHEN** a subscription has been demoted
- **THEN** the reported available detectors no longer include that subscription detector

#### Scenario: Demotion produces exactly one warning

- **WHEN** a subscription is demoted during a session
- **THEN** the extension records one warning stating that terminal color-scheme notifications stopped arriving and that theme sync switched to polling; subsequent detection cycles do not repeat the warning

#### Scenario: Demotion warning does not attribute a cause

- **WHEN** the extension records the demotion warning
- **THEN** the warning describes the observed loss of notifications rather than asserting that the terminal is incapable of sending them, because a host whose notification channel was disabled by other software produces the same evidence

#### Scenario: Demotion is timestamped in the status surface

- **WHEN** a subscription is demoted during a session
- **THEN** the extension records the fallback as its last event, so the status overlay reports when the change of strategy happened

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

