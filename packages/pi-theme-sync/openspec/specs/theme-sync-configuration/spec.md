# theme-sync-configuration Specification

## Purpose

Configuration loading, validation, migration, scoped writes, and per-key
precedence for theme sync settings.

## Requirements

### Requirement: Theme sync loads scoped configuration

The extension SHALL read one `config.json` per scope and resolve each setting
from the Project file, then the User file, then the default. The User file SHALL
be `theme-sync/config.json` under Pi's agent directory, normally `~/.pi/agent`,
and the Project file SHALL be `.pi/theme-sync/config.json` under the directory
Pi started in. The extension SHALL read the files afresh on every load and SHALL
NOT read the old `settings.json` or `theme-sync.json` files.

#### Scenario: Use User configuration when Project configuration is absent

- **WHEN** a User config file exists and no Project config file exists
- **THEN** the extension uses the User values that are present and defaults the
  remaining values

#### Scenario: Project configuration overrides User configuration per key

- **WHEN** both a User and a Project config file exist
- **THEN** the extension resolves each effective configuration key from the
  Project file first, then the User file, then defaults

#### Scenario: Invalid value falls through to the next scope

- **WHEN** a scope's value for a setting is present but invalid
- **THEN** the extension skips that value and resolves the setting from the next
  scope in Project, User, default order, reporting the source of the value it
  uses
- **AND** it emits one validation warning per invalid value, ending with the
  setting's default outcome when no scope supplies a valid value, or with
  `Ignored it.` when another scope's value applies

#### Scenario: Missing file means defaults, silently

- **WHEN** a scope has no config file
- **THEN** that scope contributes no values and the extension shows no warning
  for it

#### Scenario: Malformed file is ignored

- **WHEN** a config file contains malformed JSON or a JSON value that is not an
  object
- **THEN** the extension ignores the file with the warning
  `Configuration at <path> is not valid JSON: <message>. Ignored the file.` or
  `Configuration at <path> must be a JSON object. Ignored the file.` and uses
  the other scope and defaults

#### Scenario: Unreadable file is ignored

- **WHEN** reading a config file fails for a reason other than a missing path
- **THEN** the extension reports the warning
  `Could not read configuration at <path>: <message>. Ignored the file.` and
  uses the other scope and defaults

#### Scenario: Agent directory override applies to the User file

- **WHEN** `PI_CODING_AGENT_DIR` selects a custom Pi agent directory
- **THEN** the User file is relative to that directory and the extension does
  not also read `~/.pi/agent`

#### Scenario: File changes are recognized on the next load

- **WHEN** files are created, edited, or removed between configuration loads
- **THEN** the next load reads the current files without a process restart
- **AND** the running synchronization configuration still changes only through
  the explicit reload behavior

### Requirement: Theme sync reads Project configuration only in a trusted project

The extension SHALL read, migrate, and save the Project file only while
`ctx.isProjectTrusted()` returns `true`.

#### Scenario: Untrusted project with a Project file

- **WHEN** Pi does not trust the project and the Project file exists
- **THEN** the extension does not read it, resolves settings from the User file
  and defaults, and warns once per session
  `Skipped project configuration at <path> because the project is not trusted. Trust the project to use it.`

#### Scenario: Untrusted project without a Project file

- **WHEN** Pi does not trust the project and there is no Project file
- **THEN** the extension shows no warning about it

### Requirement: Theme sync versions its configuration file

Every config file SHALL carry a top-level integer `version`. This release reads
and writes version `2`. A file without `version` SHALL be read as version `2`
without a warning. A file with any other `version` SHALL be ignored with the
warning
`Configuration at <path> has version <found>, but only version 2 is supported. Ignored the file.`
and SHALL never be overwritten.

#### Scenario: File without a version

- **WHEN** a config file has no `version`
- **THEN** the extension reads it as the current version without a warning

#### Scenario: File with another version

- **WHEN** a config file has a `version` other than `2`
- **THEN** the extension ignores the file with a warning and uses the other
  scope and defaults

### Requirement: Theme sync migrates old configuration at session start

At session start, before loading, the extension SHALL move each scope's old file
(`theme-sync/settings.json`, or `theme-sync.json` in the directory above when
that is missing) to `config.json`, with `isSyncActive` renamed to `syncEnabled`
and `version` first, and delete the old file only after the atomic write
succeeds. One info message SHALL name every migrated file:
`Theme Sync migrated its configuration to <path>[ and <path>].`

#### Scenario: Old User file moves

- **WHEN** a session starts with `theme-sync/settings.json` in the agent
  directory and no `theme-sync/config.json`
- **THEN** the extension writes `theme-sync/config.json` with the renamed keys
  and `version`, deletes `settings.json`, and shows the migration message

#### Scenario: Only the file in use moves

- **WHEN** a scope has both `theme-sync/settings.json` and `theme-sync.json`
- **THEN** the extension moves `settings.json` and leaves `theme-sync.json` in
  place

#### Scenario: New file already exists

- **WHEN** a scope already has `config.json`
- **THEN** the extension leaves `config.json` and the old files unchanged

#### Scenario: Untrusted project keeps its old file

- **WHEN** Pi does not trust the project and the project has an old file
- **THEN** the extension leaves the old project file unchanged

#### Scenario: Old file cannot be read or parsed

- **WHEN** a scope's old file cannot be read, is not valid JSON, or is not a
  JSON object
- **THEN** nothing in that scope migrates, the old file stays unchanged, and the
  extension warns
  `Could not migrate configuration at <path>: <message> Ignored the file.`

#### Scenario: Write fails

- **WHEN** writing the new `config.json` fails
- **THEN** the old file stays unchanged and the extension warns with the same
  `Could not migrate configuration at <path>: …` warning

#### Scenario: Old file cannot be deleted

- **WHEN** the new file is written but deleting the old file fails
- **THEN** the extension counts the scope as migrated and warns
  `Created <new path> but could not remove <old path>: <message> Delete it by hand.`

#### Scenario: Hand-written file uses the old key

- **WHEN** a `config.json` has `isSyncActive` and no `syncEnabled`
- **THEN** the extension reads its value as `syncEnabled` and rewrites the file
  with `syncEnabled` and `version`, and when the rewrite fails it warns
  `Could not migrate configuration at <path>: <message> Left the file unchanged.`
  while still using the value for the session

### Requirement: Theme sync accepts theme mappings, polling settings, and sync state

The extension SHALL accept configuration for light and dark theme mappings,
polling interval, and `syncEnabled`.

#### Scenario: Read configured polling interval

- **WHEN** the user configures a finite numeric polling interval between `1000`
  and `60000` milliseconds, inclusive
- **THEN** the extension uses that interval for polling-based detection

#### Scenario: Reject an out-of-range configured polling interval

- **WHEN** a scope's polling interval is present but not a number from `1000` to
  `60000` milliseconds, inclusive
- **THEN** the extension emits the warning
  `<Project|User> setting "pollIntervalMs" must be a number between 1000 and 60000 milliseconds, not <value>.`
  followed by `Using the default value 2000.` when no scope supplies a valid
  interval, or by `Ignored it.` when the other scope's interval applies

#### Scenario: Reject a non-boolean sync state

- **WHEN** a scope's `syncEnabled` is present but not a boolean
- **THEN** the extension emits the warning
  `<Project|User> setting "syncEnabled" must be a boolean, not <value>.`
  followed by `Using the default value true.` when no scope supplies a valid
  value, or by `Ignored it.` when the other scope's value applies

#### Scenario: Read configured sync state

- **WHEN** the user configures `syncEnabled`
- **THEN** the extension uses that value to determine whether ongoing theme
  synchronization is on or off

### Requirement: Theme sync validates configured theme mappings

The extension SHALL validate configured light and dark theme mappings against
the Pi themes available at runtime.

#### Scenario: Use configured mappings when themes exist

- **WHEN** both configured theme names are available in Pi
- **THEN** the extension uses those configured theme mappings

#### Scenario: Fallback when configured light theme is unavailable

- **WHEN** no scope configures a light theme name that is available in Pi and at
  least one scope configures an unavailable one
- **THEN** the extension uses Pi built-in `light` for the light mapping

#### Scenario: Fallback when configured dark theme is unavailable

- **WHEN** no scope configures a dark theme name that is available in Pi and at
  least one scope configures an unavailable one
- **THEN** the extension uses Pi built-in `dark` for the dark mapping

#### Scenario: Warn about an unavailable theme

- **WHEN** a scope configures a light or dark theme name that is not available
  in Pi
- **THEN** the extension emits the warning `Theme "<name>" was not found in Pi.`
  followed by `Using the default theme "<light|dark>".` when no scope supplies
  an available theme for that mapping, or by `Ignored it.` when the other
  scope's theme applies

### Requirement: Theme sync supports scoped config writes

The extension SHALL write saved config changes to the chosen scope's
`config.json`, rereading it on every save, preserving unrelated settings,
renaming `isSyncActive` to `syncEnabled`, and putting the current `version`
first. It SHALL refuse to save to an invalid file or to the Project file of an
untrusted project, leaving the file unchanged. A missing file SHALL be created
with its parent directory.

#### Scenario: Write config change to the Project file

- **WHEN** the user saves config changes and chooses `Project (<path>)`
- **THEN** the extension writes those changes to the Project `config.json`

#### Scenario: Write config change to the User file

- **WHEN** the user saves config changes and chooses `User (<path>)`
- **THEN** the extension writes those changes to the User `config.json`

#### Scenario: First save creates the file

- **WHEN** the chosen scope has no `config.json` and the user saves changes
- **THEN** the extension creates `theme-sync/config.json` under that scope's
  directory with `version` and the changes

#### Scenario: Invalid file is protected

- **WHEN** the chosen file is unreadable, malformed, or has another `version`
  and the user saves changes
- **THEN** the extension refuses the save with
  `<path> is invalid (<reason>). Fix the file and try again.` and leaves the
  file unchanged

#### Scenario: Untrusted Project is protected

- **WHEN** Pi does not trust the project and the user saves to the Project scope
- **THEN** the extension refuses the save with
  `The project is not trusted, so <path> was not saved. Trust the project and try again.`
  and writes nothing

#### Scenario: Save does not fall back after a write failure

- **WHEN** writing the chosen file fails
- **THEN** the extension reports the failure and does not write any other file

### Requirement: Theme sync replaces config files atomically

The extension SHALL save a config file by writing the new contents to a
temporary file beside it and renaming that file over the destination, so the
destination never holds partially written contents.

#### Scenario: Save is interrupted

- **WHEN** a save fails or the process stops before the new contents are in
  place
- **THEN** the config file holds either its previous contents or the complete
  new contents, never a partial write

### Requirement: Theme sync requires reload to apply config changes

The extension SHALL require an explicit reload before saved config changes take
effect.

#### Scenario: Saved config changes wait for reload

- **WHEN** the user saves config changes from `/theme-sync`
- **THEN** the current runtime continues using the already-loaded configuration
  until `/reload` is run

#### Scenario: Config overlay can show newer on-disk config than runtime

- **WHEN** config files on disk differ from the configuration currently loaded
  into the running extension and the user opens `/theme-sync`
- **THEN** the overlay shows the current on-disk values while the running
  runtime continues using the already-loaded configuration until `/reload` is
  run

#### Scenario: External config edits wait for reload

- **WHEN** the user edits a Theme Sync config file outside Pi while the
  extension is already running
- **THEN** the current runtime continues using the already-loaded configuration
  until `/reload` is run

### Requirement: Theme sync reports where its configuration comes from

The extension SHALL keep the source of each effective value for the overlay and
the state of each scope's file for the status report.

#### Scenario: Mixed-source effective config is reportable

- **WHEN** effective configuration values come from a mixture of the Project
  file, the User file, and defaults
- **THEN** the overlay shows each value's source, and `/theme-sync status` shows
  each file's path and state
