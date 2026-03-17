# theme-sync-configuration

## Purpose

TBD

## Requirements

### Requirement: Theme sync loads scoped configuration

The extension SHALL load theme sync configuration from a supported global path and a supported project path.

#### Scenario: Use global configuration when project configuration is absent

- **WHEN** a supported global config file exists and no supported project config file exists
- **THEN** the extension uses the global configuration

#### Scenario: Project-local configuration overrides global configuration

- **WHEN** both a supported global config file and a supported project config file exist
- **THEN** the extension uses the project configuration

### Requirement: Theme sync accepts theme mappings and polling settings

The extension SHALL accept configuration for light and dark theme mappings and polling interval.

#### Scenario: Read configured polling interval

- **WHEN** the user configures a polling interval
- **THEN** the extension uses that interval for polling-based detection

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
