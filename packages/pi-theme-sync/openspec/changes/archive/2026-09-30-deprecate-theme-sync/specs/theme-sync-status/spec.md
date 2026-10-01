## MODIFIED Requirements

### Requirement: Theme sync notifies setup warnings once

When session setup finishes, theme sync SHALL show every warning recorded during
that setup in one warning notification headed `Theme Sync: <n> warning(s)`, in
this order: migration, configuration file, invalid value, the deprecation or
deferral notice, then detector warnings. Because every setup records the
deprecation or deferral notice, every completed setup SHALL notify. A command
that reads the configuration again SHALL NOT notify. Later warnings from the
recurring detection cycle, and warnings of a setup whose session ended first,
SHALL NOT notify.

#### Scenario: Setup records warnings

- **WHEN** a session starts and its setup records one or more warnings
- **THEN** theme sync shows one warning notification listing each of them
- **AND** `/theme-sync status` lists the same warnings, except the file
  warnings, which its `Config:` block shows as file states

#### Scenario: Deprecation notice follows configuration warnings

- **GIVEN** a setup records an invalid-value warning and a detector warning
- **WHEN** setup finishes
- **THEN** the notification lists the invalid-value warning, then the
  deprecation notice, then the detector warning

#### Scenario: Setup with nothing else to report

- **WHEN** a session starts and its setup records no migration, configuration,
  or detector warning
- **THEN** theme sync shows one warning notification headed
  `Theme Sync: 1 warning` that lists only the deprecation or deferral notice

#### Scenario: A detection cycle records a warning later

- **WHEN** a recurring detection cycle records a new warning after setup
- **THEN** theme sync does not notify it
- **AND** `/theme-sync status` lists it

#### Scenario: The session ends during setup

- **WHEN** theme sync is cleaned up, by shutdown or a newer session start,
  before a setup finishes
- **THEN** that setup does not notify its warnings
