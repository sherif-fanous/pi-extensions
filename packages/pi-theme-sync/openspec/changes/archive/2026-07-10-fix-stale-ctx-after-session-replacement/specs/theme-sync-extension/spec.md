## ADDED Requirements

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
