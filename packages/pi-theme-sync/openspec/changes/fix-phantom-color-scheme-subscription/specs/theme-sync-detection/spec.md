## MODIFIED Requirements

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

## ADDED Requirements

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
