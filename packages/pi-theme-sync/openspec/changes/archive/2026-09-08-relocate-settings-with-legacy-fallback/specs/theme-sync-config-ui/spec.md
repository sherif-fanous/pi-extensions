## MODIFIED Requirements

### Requirement: Theme sync config save flow asks where to write changes

The extension SHALL ask the user whether to write saved config changes to project or global config. Each write-target label SHALL show the resolved destination for its scope using the same preferred-path and missing-only legacy fallback rules as configuration persistence. The extension SHALL resolve these labels from current filesystem state whenever the write-target view opens.

#### Scenario: Save chooses project write target

- **WHEN** the user saves config changes and chooses `Project (<path>)`
- **THEN** the extension writes the saved config changes to the project config file

#### Scenario: Save chooses global write target

- **WHEN** the user saves config changes and chooses `Global (<path>)`
- **THEN** the extension writes the saved config changes to the global config file

#### Scenario: Preferred destination is displayed

- **WHEN** a scope's preferred file exists or neither candidate exists
- **THEN** that scope's write-target label shows the full path to `theme-sync/settings.json` under its Pi directory

#### Scenario: Legacy destination is displayed

- **WHEN** a scope's preferred file is missing and its legacy file exists
- **THEN** that scope's write-target label shows the full path to the selected `theme-sync.json` file

#### Scenario: Write targets resolve independently

- **WHEN** one scope selects a preferred destination and the other selects a legacy destination
- **THEN** each label shows its own resolved destination, including the custom global agent directory when configured

#### Scenario: Reopening write targets reflects manual migration

- **WHEN** the user migrates config files and subsequently reopens the write-target view
- **THEN** the labels reflect the current selected paths rather than previously displayed paths
