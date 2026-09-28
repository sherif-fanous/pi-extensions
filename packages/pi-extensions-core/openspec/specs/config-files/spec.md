# config-files Specification

## Purpose

Give Pi extensions one way to read, version, migrate, save, and report their
`config.json` files in the User and Project scopes, so every extension honors
Pi's project trust, treats the `version` key the same way, reads renamed keys
under their old names, and shows the same startup messages and `Config:` block
in its status report.

## Requirements

### Requirement: An extension describes its configuration file once

The package SHALL export a
`defineConfigFile({ extension, extensionName, version, scopes, renamedKeys, legacyFileNames })`
function that returns a handle with `path(ctx, scope)`, `read(ctx, scope)`,
`load(ctx)`, `update(ctx, scope, update)`, `write(ctx, scope, document)`, and
`migrateKeys(ctx)`. Every operation SHALL take the handler context and SHALL
call `ctx.isProjectTrusted()` only for a project file. The package SHALL also
export a `ConfigScope` type (`"user" | "project"`) and a
`configScopeLabel(scope)` function that returns `User` or `Project`.

#### Scenario: Only the user scope

- **WHEN** a handle whose `scopes` are `["user"]` loads
- **THEN** it returns only a `user` file and does not call
  `ctx.isProjectTrusted()`

#### Scenario: Scope labels

- **WHEN** `configScopeLabel` receives `user` or `project`
- **THEN** it returns `User` or `Project`

### Requirement: Each scope's file is read into a tagged state

`read` and `load` SHALL NOT throw for a file problem. A `ConfigFile` SHALL carry
its `scope` and `path` and one `state`: `loaded` with the file's `data` and the
`renamedKeys` found, `missing` for no file, `invalid` with a short `reason` and
a `warning`, or `untrusted` with a `warning`.

#### Scenario: A missing file

- **WHEN** a scope has no file
- **THEN** its state is `missing` and it has no warning

#### Scenario: A malformed or unreadable file

- **WHEN** a file is not valid JSON, is not a JSON object, or cannot be read
- **THEN** its state is `invalid`, its `reason` is `not valid JSON: <message>`,
  `not a JSON object`, or `unreadable: <message>`, and its `warning` is the
  json-config wording for that failure

### Requirement: Project files are read only when Pi trusts the project

The handle SHALL read the project file only when `ctx.isProjectTrusted()`
returns `true`. In an untrusted project, an existing project file SHALL have the
state `untrusted` and the warning
`Skipped project configuration at <path> because the project is not trusted. Trust the project to use it.`
When `config.json` is missing, the first of `legacyFileNames` beside it that
exists SHALL be reported the same way, with its own path. Otherwise the project
file SHALL be `missing`, with no warning.

#### Scenario: An untrusted project with a project file

- **WHEN** the project file exists and `ctx.isProjectTrusted()` returns `false`
- **THEN** the project state is `untrusted` with the skipped-configuration
  warning, and the file is not read

#### Scenario: An untrusted project with only a legacy file

- **WHEN** `legacyFileNames` lists `presets.json`, only `presets.json` exists
  beside the project `config.json`, and `ctx.isProjectTrusted()` returns `false`
- **THEN** the project state is `untrusted` with the path of `presets.json`

#### Scenario: An untrusted project without a project file

- **WHEN** no project file exists and `ctx.isProjectTrusted()` returns `false`
- **THEN** the project state is `missing` and no warning is produced

### Requirement: Files carry a version the reader checks

A file whose top-level `version` is absent SHALL be read as the current
`version`, without a warning. A file whose `version` is present and differs from
`version` SHALL be `invalid` with the reason `unsupported version <found>` and
the warning
`Configuration at <path> has version <found>, but only version <supported> is supported. Ignored the file.`,
with `<found>` written as JSON.

#### Scenario: No version

- **WHEN** a file has no `version` key
- **THEN** its state is `loaded`

#### Scenario: A newer version

- **WHEN** a file has `"version": 3` and the reader's version is 2
- **THEN** its state is `invalid` with the reason `unsupported version 3`

### Requirement: Renamed keys are read under their old names

Each `{ from, to }` pair of `renamedKeys` SHALL move an old key, a dot-separated
path, to its new path in a loaded file's `data`, creating objects on the way,
and list the old name in the file's `renamedKeys`. When both keys are present
the new key SHALL win and the old key SHALL be dropped. A rename SHALL be
skipped when the old key is absent or a value on the way to the new path is not
an object.

#### Scenario: Only the old key

- **WHEN** a file holds `maxToastsVisible` and the renames map it to
  `toast.maxVisible`
- **THEN** `data.toast.maxVisible` holds its value and `renamedKeys` lists
  `maxToastsVisible`

#### Scenario: Both keys

- **WHEN** a file holds both `isSyncActive` and `syncEnabled`
- **THEN** `data` keeps `syncEnabled` and drops `isSyncActive`

### Requirement: Renamed keys are migrated into the file

`migrateKeys` SHALL rewrite every loaded file with a non-empty `renamedKeys`
with its data and the current `version` first, skip a project Pi does not trust,
and return a `ConfigMigration`, `{ migrated, warnings }`, with the paths
rewritten, User before Project, and, for each failed write,
`Could not migrate configuration at <path>: <message>. Left the file unchanged.`
It SHALL leave every other file alone.

#### Scenario: A file with old keys

- **WHEN** a loaded file has renamed keys
- **THEN** it is rewritten with the new keys and the current version, and its
  path is in `migrated`

#### Scenario: A failed write

- **WHEN** writing the migrated file fails
- **THEN** the file keeps its contents and the result holds one warning for it

### Requirement: Saves stamp the version and never overwrite an unusable file

`update` SHALL read the file again, pass its data (renamed keys moved, or `{}`
when missing) to `update`, and write the result atomically with `version` as its
first key. `write` SHALL write a document atomically as the scope's file, with
renamed keys moved and `version` first. Both SHALL throw without writing when
the scope is a project Pi does not trust, and `update` also when the file is
`invalid`.

#### Scenario: Saving to a missing file

- **WHEN** `update` saves to a scope with no file
- **THEN** the file holds the update's result with the current `version` first

#### Scenario: Saving over a malformed file or a newer version

- **WHEN** the file is not valid JSON or has another `version`
- **THEN** `update` throws
  `<path> is invalid (<reason>). Fix the file and try again.` and the file is
  unchanged

#### Scenario: Saving to an untrusted project

- **WHEN** `update` or `write` saves to the project scope of an untrusted
  project
- **THEN** it throws
  `The project is not trusted, so <path> was not saved. Trust the project and try again.`
  and writes nothing

### Requirement: A load's outcome delivers startup messages in one order

`load` SHALL return an immutable `ConfigOutcome` holding `files`, whose
`withMigrations(...migrations)` and `withValueWarnings(warnings)` return a copy
with them added after the ones present. `notify(ctx, extras)` SHALL send, when
anything migrated, one info message
`<extensionName> migrated its configuration to <paths>.`, with two paths joined
by `and` and more as `a, b, and c`, then one `notifyWarnings` notification
listing migration warnings, file warnings (User before Project), value warnings,
and `extras`, in that order, and nothing when both are empty. `warnings` SHALL
list the same warnings without `extras`.

#### Scenario: A migration and warnings

- **WHEN** an outcome with one migrated path, a migration warning, an untrusted
  project file, and a value warning is notified with one extra warning
- **THEN** one info message names the path, then one warning notification lists
  the migration warning, the skipped-configuration warning, the value warning,
  and the extra warning

#### Scenario: Nothing to say

- **WHEN** nothing migrated and no warning applies
- **THEN** `notify` sends nothing

### Requirement: Status reports show a Config block

The outcome's `statusLines` SHALL be a `Config:` line followed, User before
Project, by each file's `alignLabelRows` row `<Scope>: <state>` and a line
holding its path aligned under the state. States SHALL read `loaded`,
`not found`, `invalid: <reason>`, and `skipped (untrusted)`. `statusWarnings`
SHALL list migration warnings, then value warnings, leaving file problems to
`statusLines`.

#### Scenario: A loaded user file and an untrusted project file

- **WHEN** the user file loads and the project file is skipped as untrusted
- **THEN** `statusLines` is `Config:`, `  User:    loaded`, the user path
  indented by 11 spaces, `  Project: skipped (untrusted)`, and the project path
  indented by 11 spaces
