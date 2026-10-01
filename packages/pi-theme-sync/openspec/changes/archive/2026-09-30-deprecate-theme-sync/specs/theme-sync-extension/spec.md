## ADDED Requirements

### Requirement: Theme sync announces its deprecation

At every session start where Theme Sync does not defer to Pi's theme pair, the
extension SHALL record a deprecation notice as a setup warning. The notice SHALL
read
`Theme Sync is deprecated because Pi now switches themes itself. Set "theme": "<light>/<dark>" in Pi's settings.json, then run pi remove npm:@sherif-fanous/pi-theme-sync.`,
where `<light>` and `<dark>` are the effective light and dark theme mappings
after the Project file, the User file, and the defaults are merged. The notice
SHALL appear whether effective `syncEnabled` is `true` or `false`.

#### Scenario: Notice uses the effective theme mapping

- **GIVEN** the effective light theme is `catppuccin-latte` and the effective
  dark theme is `catppuccin-macchiato`
- **WHEN** a session starts and Pi's theme setting is not a light/dark pair
- **THEN** the setup warnings include
  `Theme Sync is deprecated because Pi now switches themes itself. Set "theme": "catppuccin-latte/catppuccin-macchiato" in Pi's settings.json, then run pi remove npm:@sherif-fanous/pi-theme-sync.`

#### Scenario: Notice uses the default mapping without configuration

- **GIVEN** neither configuration file exists
- **WHEN** a session starts and Pi's theme setting is not a light/dark pair
- **THEN** the notice names `"theme": "light/dark"`

#### Scenario: Notice appears while sync is off

- **GIVEN** effective `syncEnabled` is `false`
- **WHEN** a session starts and Pi's theme setting is not a light/dark pair
- **THEN** the setup warnings include the deprecation notice
- **AND** the extension behaves as it does with sync off, without applying a
  theme

#### Scenario: Sync keeps working after the notice

- **GIVEN** effective `syncEnabled` is `true`
- **WHEN** a session starts and Pi's theme setting is not a light/dark pair
- **THEN** the extension detects the appearance and applies the mapped theme as
  it did before this change

### Requirement: Theme sync defers to Pi's light/dark theme pair

When Pi exposes its effective settings to extensions and the effective `theme`
setting is a light/dark pair, the extension SHALL NOT probe detectors, poll,
subscribe to appearance reports, or change Pi's theme for that session. A
light/dark pair is a value with exactly one `/` and a non-empty theme name,
after trimming, on each side. Instead of the deprecation notice, the extension
SHALL record one setup warning reading
`Theme Sync is deprecated and is not changing themes because Pi's theme setting "<value>" already follows the terminal. Run pi remove npm:@sherif-fanous/pi-theme-sync to uninstall it.`,
where `<value>` is the setting as Pi reports it. The deferral SHALL apply
whatever the effective `syncEnabled` is. When Pi does not expose its settings,
or reading them fails, the extension SHALL behave as though the setting is not a
pair.

#### Scenario: Pi's theme setting is a pair

- **GIVEN** Pi reports the effective theme setting
  `catppuccin-latte/catppuccin-macchiato`
- **WHEN** a session starts with effective `syncEnabled` `true`
- **THEN** the extension sends no terminal query and does not call Pi's theme
  setter
- **AND** the setup warnings contain the deferral notice naming
  `catppuccin-latte/catppuccin-macchiato` and not the deprecation notice

#### Scenario: Pi's theme setting is a single theme

- **GIVEN** Pi reports the effective theme setting `dark`, or no theme setting
- **WHEN** a session starts
- **THEN** the extension does not defer and records the deprecation notice

#### Scenario: Pi's theme setting is not a valid pair

- **GIVEN** Pi reports a theme setting with two `/` characters, or with an empty
  side such as `light/`
- **WHEN** a session starts
- **THEN** the extension does not defer

#### Scenario: Pi does not expose its settings

- **GIVEN** the host Pi does not offer the settings reader, or the reader throws
- **WHEN** a session starts
- **THEN** the extension does not defer, raises no error, and records the
  deprecation notice

#### Scenario: Status while deferring

- **GIVEN** the extension deferred to Pi's theme pair
- **WHEN** the user runs `/theme-sync status`
- **THEN** the report shows sync `off`, appearance `unknown`, desired theme
  `none`, detection strategy `Inactive`, and last event
  `Deferred to Pi's theme setting`
- **AND** it lists the deferral notice under `Warnings:`
