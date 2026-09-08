## MODIFIED Requirements

### Requirement: Theme sync loads scoped configuration

The extension SHALL select one configuration file independently for each scope and load configuration using project-over-global per-key precedence. The global preferred path SHALL be `theme-sync/settings.json` under Pi's agent directory, normally `~/.pi/agent`, and the global legacy path SHALL be `theme-sync.json` under that same directory. The project preferred path SHALL be `.pi/theme-sync/settings.json` under the current project directory and the project legacy path SHALL be `.pi/theme-sync.json`. The extension SHALL use a legacy file only when that scope's preferred file is missing, SHALL NOT merge preferred and legacy files within a scope, and SHALL resolve selection afresh on every load.

#### Scenario: Use global configuration when project configuration is absent

- **WHEN** a supported global config file exists and no supported project config file exists
- **THEN** the extension uses the global configuration values that are present and defaults the remaining values

#### Scenario: Project-local configuration overrides global configuration per key

- **WHEN** both a supported global config file and a supported project config file exist
- **THEN** the extension resolves each effective configuration key from project config first, then global config, then defaults

#### Scenario: Preferred file wins within either scope

- **WHEN** a scope contains both preferred and legacy config files
- **THEN** the extension reads only the preferred file for that scope, including when it is an empty JSON object or omits settings present in the legacy file

#### Scenario: Legacy file remains supported

- **WHEN** a scope's preferred file is missing and its legacy file exists
- **THEN** the extension reads the legacy file for that scope without a runtime deprecation warning

#### Scenario: Neither file exists

- **WHEN** both config files for a scope are missing
- **THEN** that scope contributes no configured values and the extension uses the other scope and defaults according to existing precedence

#### Scenario: Mixed file layouts preserve scope precedence

- **WHEN** the project selects a legacy file and global selects a preferred file, or the project selects a preferred file and global selects a legacy file
- **THEN** project values override global values per key regardless of file layout

#### Scenario: Malformed preferred file does not reveal legacy settings

- **WHEN** a preferred file contains malformed JSON or a JSON value that is not an object and a legacy file exists
- **THEN** the extension reports the preferred file's validation warning and does not load that scope's legacy file

#### Scenario: Unreadable preferred file does not trigger fallback

- **WHEN** reading the preferred file fails for a reason other than a missing path
- **THEN** the extension reports the I/O failure through existing error handling and does not read the legacy file instead

#### Scenario: Global directory override applies to both candidates

- **WHEN** `PI_CODING_AGENT_DIR` selects a custom Pi agent directory
- **THEN** both global candidates are relative to that directory and the extension does not additionally search `~/.pi/agent`

#### Scenario: Manual migration is recognized on the next load

- **WHEN** files are created, moved, or removed between configuration loads
- **THEN** the next load selects files from the current filesystem state without requiring a process restart
- **AND** the running synchronization configuration still changes only through the existing explicit reload behavior

### Requirement: Theme sync supports scoped config writes

The extension SHALL support writing saved config changes to either the project or global config file. On every save it SHALL resolve the destination afresh using the same missing-only fallback rule as loading. It SHALL update only the selected file, preserve unrelated settings, and refuse to overwrite a selected file containing malformed JSON or a non-object JSON value. If neither candidate exists, it SHALL create the preferred path and its parent directory. It SHALL NOT automatically move or delete config files.

#### Scenario: Write config change to project scope

- **WHEN** the user saves config changes and chooses `Project (<path>)`
- **THEN** the extension writes those changes to the project config file

#### Scenario: Write config change to global scope

- **WHEN** the user saves config changes and chooses `Global (<path>)`
- **THEN** the extension writes those changes to the global config file

#### Scenario: Save continues using a selected legacy file

- **WHEN** the preferred file is missing and the legacy file exists in the chosen scope
- **THEN** the extension updates the legacy file, preserves unrelated settings, and does not create the preferred file

#### Scenario: Save updates preferred file only

- **WHEN** both files exist in the chosen scope and the preferred file contains a valid JSON object
- **THEN** the extension updates the preferred file, preserves its unrelated settings, and leaves the legacy file unchanged

#### Scenario: First save creates the preferred file

- **WHEN** neither file exists in the chosen scope and the user saves changes
- **THEN** the extension creates `theme-sync/settings.json` under that scope's Pi directory, including the parent directory if needed

#### Scenario: Malformed selected file is protected

- **WHEN** the selected preferred or legacy file contains malformed JSON or a non-object JSON value and the user saves changes
- **THEN** the extension refuses the save, identifies the selected path in the error, and leaves both candidates unchanged

#### Scenario: Save does not fall back after an I/O failure

- **WHEN** reading or writing the selected destination fails with an I/O error other than a missing file on read
- **THEN** the extension reports the failure through existing error handling and does not write the other candidate instead

#### Scenario: Save recognizes migration since a previous load

- **WHEN** the preferred file has been created since a load selected the legacy file
- **THEN** the next save selects and rereads the preferred file before applying changes instead of writing the previously selected legacy file
