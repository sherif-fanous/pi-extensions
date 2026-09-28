# theme-sync-configuration

## Purpose

Configuration loading, validation, scoped writes, and per-key precedence for
theme sync settings.

## Requirements

### Requirement: Theme sync loads scoped configuration

The extension SHALL select one configuration file independently for each scope
and load configuration using project-over-global per-key precedence. The global
preferred path SHALL be `theme-sync/settings.json` under Pi's agent directory,
normally `~/.pi/agent`, and the global legacy path SHALL be `theme-sync.json`
under that same directory. The project preferred path SHALL be
`.pi/theme-sync/settings.json` under the current project directory and the
project legacy path SHALL be `.pi/theme-sync.json`. The extension SHALL use a
legacy file only when that scope's preferred file is missing, SHALL NOT merge
preferred and legacy files within a scope, and SHALL resolve selection afresh on
every load.

#### Scenario: Use global configuration when project configuration is absent

- **WHEN** a supported global config file exists and no supported project config
  file exists
- **THEN** the extension uses the global configuration values that are present
  and defaults the remaining values

#### Scenario: Project-local configuration overrides global configuration per key

- **WHEN** both a supported global config file and a supported project config
  file exist
- **THEN** the extension resolves each effective configuration key from project
  config first, then global config, then defaults

#### Scenario: Invalid value falls through to the next scope

- **WHEN** a scope's value for a setting is present but invalid
- **THEN** the extension skips that value and resolves the setting from the next
  scope in project, global, default order, reporting the source of the value it
  uses
- **AND** it emits one validation warning per invalid value, ending with the
  setting's default outcome when no scope supplies a valid value, or with
  `Ignored it.` when another scope's value applies

#### Scenario: Preferred file wins within either scope

- **WHEN** a scope contains both preferred and legacy config files
- **THEN** the extension reads only the preferred file for that scope, including
  when it is an empty JSON object or omits settings present in the legacy file

#### Scenario: Legacy file remains supported

- **WHEN** a scope's preferred file is missing and its legacy file exists
- **THEN** the extension reads the legacy file for that scope without a runtime
  deprecation warning

#### Scenario: Neither file exists

- **WHEN** both config files for a scope are missing
- **THEN** that scope contributes no configured values and the extension uses
  the other scope and defaults according to existing precedence

#### Scenario: Mixed file layouts preserve scope precedence

- **WHEN** the project selects a legacy file and global selects a preferred
  file, or the project selects a preferred file and global selects a legacy file
- **THEN** project values override global values per key regardless of file
  layout

#### Scenario: Malformed preferred file does not reveal legacy settings

- **WHEN** a preferred file contains malformed JSON or a JSON value that is not
  an object and a legacy file exists
- **THEN** the extension reports the preferred file's validation warning and
  does not load that scope's legacy file

#### Scenario: Unreadable preferred file is ignored without fallback

- **WHEN** reading the preferred file fails for a reason other than a missing
  path
- **THEN** the extension reports the warning
  `Could not read configuration at <path>: <message>. Ignored the file.`, uses
  the other scope and defaults as if that scope had no configured values, and
  does not read the legacy file instead

#### Scenario: Global directory override applies to both candidates

- **WHEN** `PI_CODING_AGENT_DIR` selects a custom Pi agent directory
- **THEN** both global candidates are relative to that directory and the
  extension does not additionally search `~/.pi/agent`

#### Scenario: Manual migration is recognized on the next load

- **WHEN** files are created, moved, or removed between configuration loads
- **THEN** the next load selects files from the current filesystem state without
  requiring a process restart
- **AND** the running synchronization configuration still changes only through
  the existing explicit reload behavior

### Requirement: Theme sync accepts theme mappings, polling settings, and sync activation state

The extension SHALL accept configuration for light and dark theme mappings,
polling interval, and `isSyncActive`.

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

#### Scenario: Reject a non-boolean sync activation state

- **WHEN** a scope's `isSyncActive` is present but not a boolean
- **THEN** the extension emits the warning
  `<Project|User> setting "isSyncActive" must be a boolean, not <value>.`
  followed by `Using the default value true.` when no scope supplies a valid
  value, or by `Ignored it.` when the other scope's value applies

#### Scenario: Read configured sync activation state

- **WHEN** the user configures `isSyncActive`
- **THEN** the extension uses that value to determine whether ongoing theme
  synchronization is active or inactive

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

The extension SHALL support writing saved config changes to either the project
or global config file. On every save it SHALL resolve the destination afresh
using the same missing-only fallback rule as loading. It SHALL update only the
selected file, preserve unrelated settings, and refuse to overwrite a selected
file that cannot be read or contains malformed JSON or a non-object JSON value.
If neither candidate exists, it SHALL create the preferred path and its parent
directory. It SHALL NOT automatically move or delete config files.

#### Scenario: Write config change to project scope

- **WHEN** the user saves config changes and chooses `Project (<path>)`
- **THEN** the extension writes those changes to the project config file

#### Scenario: Write config change to global scope

- **WHEN** the user saves config changes and chooses `User (<path>)`
- **THEN** the extension writes those changes to the global config file

#### Scenario: Save continues using a selected legacy file

- **WHEN** the preferred file is missing and the legacy file exists in the
  chosen scope
- **THEN** the extension updates the legacy file, preserves unrelated settings,
  and does not create the preferred file

#### Scenario: Save updates preferred file only

- **WHEN** both files exist in the chosen scope and the preferred file contains
  a valid JSON object
- **THEN** the extension updates the preferred file, preserves its unrelated
  settings, and leaves the legacy file unchanged

#### Scenario: First save creates the preferred file

- **WHEN** neither file exists in the chosen scope and the user saves changes
- **THEN** the extension creates `theme-sync/settings.json` under that scope's
  Pi directory, including the parent directory if needed

#### Scenario: Malformed selected file is protected

- **WHEN** the selected preferred or legacy file contains malformed JSON or a
  non-object JSON value and the user saves changes
- **THEN** the extension refuses the save, identifies the selected path in the
  error, and leaves both candidates unchanged

#### Scenario: Unreadable selected file is protected

- **WHEN** reading the selected preferred file fails with an I/O error other
  than a missing file and the user saves changes
- **THEN** the extension refuses the save, identifies the selected path in the
  error, and leaves both candidates unchanged

#### Scenario: Save does not fall back after a write failure

- **WHEN** writing the selected destination fails
- **THEN** the extension reports the failure through existing error handling and
  does not write the other candidate instead

#### Scenario: Save recognizes migration since a previous load

- **WHEN** the preferred file has been created since a load selected the legacy
  file
- **THEN** the next save selects and rereads the preferred file before applying
  changes instead of writing the previously selected legacy file

### Requirement: Theme sync replaces config files atomically

The extension SHALL save a config file by writing the new contents to a
temporary file beside it and renaming that file over the destination, so the
destination never holds partially written contents.

#### Scenario: Save is interrupted

- **WHEN** a save fails or the process stops before the new contents are in
  place
- **THEN** the selected config file holds either its previous contents or the
  complete new contents, never a partial write

### Requirement: Theme sync requires reload to apply config changes

The extension SHALL require an explicit reload before saved config changes take
effect.

#### Scenario: Saved config changes wait for reload

- **WHEN** the user saves config changes from `/theme-sync config`
- **THEN** the current runtime continues using the already-loaded configuration
  until `/reload` is run

#### Scenario: Config widget can show newer on-disk config than runtime

- **WHEN** config files on disk differ from the configuration currently loaded
  into the running extension and the user opens `/theme-sync config`
- **THEN** the config widget shows the current on-disk values while the running
  runtime continues using the already-loaded configuration until `/reload` is
  run

#### Scenario: External config edits wait for reload

- **WHEN** the user edits a theme-sync config file outside Pi while the
  extension is already running
- **THEN** the current runtime continues using the already-loaded configuration
  until `/reload` is run

### Requirement: Theme sync can report effective config sources

The extension SHALL retain enough config-source metadata to explain where
effective values came from.

#### Scenario: Mixed-source effective config is reportable

- **WHEN** effective configuration values come from a mixture of project config,
  global config, and defaults
- **THEN** the extension can report per-field config sources for status
  inspection
