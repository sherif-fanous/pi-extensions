## ADDED Requirements

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

<!-- "Theme sync prefers subscription updates when available" is intentionally
     unchanged. The DECRQM probe is retained, so subscription availability is
     still gated on DEC mode 2031 support exactly as specified; only the
     mechanism that delivers the notifications moved to Pi's API, which the
     ADDED requirement above covers. -->

## MODIFIED Requirements

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

## REMOVED Requirements

<!-- None. The DEC mode 2031 and DSR 996/997 detectors are implementation
     details of the requirements above, not separately specified behavior. -->
