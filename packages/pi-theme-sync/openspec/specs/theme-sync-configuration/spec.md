# theme-sync-configuration

## Purpose

Configuration loading, validation, scoped writes, and per-key precedence for theme sync settings.

## Requirements

### Requirement: Theme sync loads scoped configuration

The extension SHALL load theme sync configuration from a supported global path and a supported project path using per-key precedence.

#### Scenario: Use global configuration when project configuration is absent

- **WHEN** a supported global config file exists and no supported project config file exists
- **THEN** the extension uses the global configuration values that are present and defaults the remaining values

#### Scenario: Project-local configuration overrides global configuration per key

- **WHEN** both a supported global config file and a supported project config file exist
- **THEN** the extension resolves each effective configuration key from project config first, then global config, then defaults

### Requirement: Theme sync accepts theme mappings, polling settings, and sync activation state

The extension SHALL accept configuration for light and dark theme mappings, polling interval, and `isSyncActive`.

#### Scenario: Read configured polling interval

- **WHEN** the user configures a finite numeric polling interval between `1000` and `60000` milliseconds, inclusive
- **THEN** the extension uses that interval for polling-based detection

#### Scenario: Reject an out-of-range configured polling interval

- **WHEN** the selected polling interval is outside `1000` to `60000` milliseconds, inclusive
- **THEN** the extension uses the default `2000` milliseconds, reports Default provenance, and emits a validation warning

#### Scenario: Read configured sync activation state

- **WHEN** the user configures `isSyncActive`
- **THEN** the extension uses that value to determine whether ongoing theme synchronization is active or inactive

### Requirement: Theme sync validates configured theme mappings

The extension SHALL validate configured light and dark theme mappings against the Pi themes available at runtime.

#### Scenario: Use configured mappings when themes exist

- **WHEN** both configured theme names are available in Pi
- **THEN** the extension uses those configured theme mappings

#### Scenario: Fallback when configured light theme is unavailable

- **WHEN** the configured light theme name is not available in Pi
- **THEN** the extension uses Pi built-in `light` for the light mapping

#### Scenario: Fallback when configured dark theme is unavailable

- **WHEN** the configured dark theme name is not available in Pi
- **THEN** the extension uses Pi built-in `dark` for the dark mapping

### Requirement: Theme sync supports scoped config writes

The extension SHALL support writing saved config changes to either the project or global config file.

#### Scenario: Write config change to project scope

- **WHEN** the user saves config changes and chooses `Project (<path>)`
- **THEN** the extension writes those changes to the project config file

#### Scenario: Write config change to global scope

- **WHEN** the user saves config changes and chooses `Global (<path>)`
- **THEN** the extension writes those changes to the global config file

### Requirement: Theme sync requires reload to apply config changes

The extension SHALL require an explicit reload before saved config changes take effect.

#### Scenario: Saved config changes wait for reload

- **WHEN** the user saves config changes from `/theme-sync config`
- **THEN** the current runtime continues using the already-loaded configuration until `/reload` is run

#### Scenario: Config widget can show newer on-disk config than runtime

- **WHEN** config files on disk differ from the configuration currently loaded into the running extension and the user opens `/theme-sync config`
- **THEN** the config widget shows the current on-disk values while the running runtime continues using the already-loaded configuration until `/reload` is run

#### Scenario: External config edits wait for reload

- **WHEN** the user edits a theme-sync config file outside Pi while the extension is already running
- **THEN** the current runtime continues using the already-loaded configuration until `/reload` is run

### Requirement: Theme sync can report effective config sources

The extension SHALL retain enough config-source metadata to explain where effective values came from.

#### Scenario: Mixed-source effective config is reportable

- **WHEN** effective configuration values come from a mixture of project config, global config, and defaults
- **THEN** the extension can report per-field config sources for status inspection
