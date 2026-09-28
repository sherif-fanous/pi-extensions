# config-files Specification

## Purpose

Give Pi extensions one way to read, version, migrate, save, and report their
`config.json` files in the User and Project scopes, so every extension honors
Pi's project trust, treats the `version` key the same way, reads renamed keys
under their old names, and shows the same `Config:` block in its status report.

## Requirements

### Requirement: Configuration files have one name and location per scope

The package SHALL export a `ConfigScope` type (`"user" | "project"`), a
`configScopeLabel(scope)` function that returns `User` or `Project`, and a
`configFilePath(scope, { cwd, extension, agentDir })` function that returns
`<agentDir>/<extension>/config.json` for `user`, with `agentDir` defaulting to
Pi's `getAgentDir()`, and `<cwd>/<CONFIG_DIR_NAME>/<extension>/config.json` for
`project`.

#### Scenario: Paths in each scope

- **WHEN** `configFilePath` receives an agent directory, a project directory,
  and the extension `theme-sync`
- **THEN** it returns `<agentDir>/theme-sync/config.json` for `user` and
  `<cwd>/.pi/theme-sync/config.json` for `project`

#### Scenario: Scope labels

- **WHEN** `configScopeLabel` receives `user` or `project`
- **THEN** it returns `User` or `Project`

### Requirement: Each scope's file is read into a tagged state

The package SHALL export a
`readConfigFile({ scope, path, trusted, version, renamedKeys, fs })` function
and a
`loadConfigFiles(ctx, { extension, scopes, version, renamedKeys, agentDir, fs })`
function that reads `configFilePath` in each scope of `scopes` and returns a
record with one `ConfigFile` per scope. Neither SHALL throw for a file problem.
A `ConfigFile` SHALL carry its `scope` and `path` and one `state`: `loaded` with
the file's `data` and the `renamedKeys` found, `missing` for no file, `invalid`
with a short `reason` and a `warning`, or `untrusted` with a `warning`.

#### Scenario: A missing file

- **WHEN** a scope has no file
- **THEN** its state is `missing` and it has no warning

#### Scenario: A malformed or unreadable file

- **WHEN** a file is not valid JSON, is not a JSON object, or cannot be read
- **THEN** its state is `invalid`, its `reason` is `not valid JSON: <message>`,
  `not a JSON object`, or `unreadable: <message>`, and its `warning` is the
  `malformedConfigWarning` or `unreadableConfigWarning` text

#### Scenario: Only the user scope

- **WHEN** `loadConfigFiles` receives `scopes: ["user"]`
- **THEN** it returns only a `user` entry and does not call
  `ctx.isProjectTrusted()`

### Requirement: Project files are read only when Pi trusts the project

`loadConfigFiles` SHALL read the project file only when `ctx.isProjectTrusted()`
returns `true`, and `readConfigFile` only when `trusted` is `true`. In an
untrusted project, an existing project file SHALL have the state `untrusted` and
the warning
`Skipped project configuration at <path> because the project is not trusted. Trust the project to use it.`,
which `untrustedProjectConfigWarning(path)` also returns; a missing project file
SHALL be `missing`, with no warning.

#### Scenario: An untrusted project with a project file

- **WHEN** the project file exists and `ctx.isProjectTrusted()` returns `false`
- **THEN** the project state is `untrusted` with the skipped-configuration
  warning, and the file is not read

#### Scenario: An untrusted project without a project file

- **WHEN** no project file exists and `ctx.isProjectTrusted()` returns `false`
- **THEN** the project state is `missing` and no warning is produced

#### Scenario: A trusted project

- **WHEN** `ctx.isProjectTrusted()` returns `true`
- **THEN** the project file is read like the user file

### Requirement: Files carry a version the reader checks

A file whose top-level `version` is absent SHALL be read as the current
`version`, without a warning. A file whose `version` is present and differs from
`version` SHALL be `invalid` with the reason `unsupported version <found>` and
the warning
`Configuration at <path> has version <found>, but only version <supported> is supported. Ignored the file.`,
which `unsupportedConfigVersionWarning(path, found, supported)` also returns,
with `<found>` written as JSON.

#### Scenario: No version

- **WHEN** a file has no `version` key
- **THEN** its state is `loaded`

#### Scenario: A newer version

- **WHEN** a file has `"version": 3` and the reader's version is 2
- **THEN** its state is `invalid` with the reason `unsupported version 3`

### Requirement: Renamed keys are read under their old names

The package SHALL export a `renameConfigKeys(document, renames)` function that
takes `{ from, to }` pairs of dot-separated paths and returns
`{ document, renamed }`: a copy of the document with each old key moved to its
new path, creating objects on the way, and the `from` path of every rename
applied. When both keys are present the new key SHALL win and the old key SHALL
be dropped. A rename SHALL be skipped when the old key is absent or a value on
the way to the new path is not an object. The input SHALL NOT change.
`readConfigFile` and `loadConfigFiles` SHALL apply `renamedKeys` to a loaded
file's `data` and list the old names found in its `renamedKeys`.

#### Scenario: Only the old key

- **WHEN** a file holds `maxToastsVisible` and the renames map it to
  `toast.maxVisible`
- **THEN** `data.toast.maxVisible` holds its value and `renamedKeys` lists
  `maxToastsVisible`

#### Scenario: Both keys

- **WHEN** a file holds both `isSyncActive` and `syncEnabled`
- **THEN** `data` keeps `syncEnabled` and drops `isSyncActive`

### Requirement: Renamed keys are migrated into the file

The package SHALL export a `migrateRenamedConfigKeys(files, version, fs)`
function that rewrites every `loaded` file with a non-empty `renamedKeys`
through `writeConfigFile`, and returns `{ migrated, warnings }` with the paths
rewritten and, for each failed write,
`Could not migrate configuration at <path>: <message>. Left the file unchanged.`
It SHALL leave every other file alone. The package SHALL export a
`configMigratedMessage(extensionName, paths)` function that returns
`<extensionName> migrated its configuration to <paths>.`, with two paths joined
by `and` and more as `a, b, and c`.

#### Scenario: A file with old keys

- **WHEN** a loaded file has renamed keys
- **THEN** it is rewritten with the new keys and the current version, and its
  path is in `migrated`

#### Scenario: A failed write

- **WHEN** writing the migrated file fails
- **THEN** the file keeps its contents and the result holds one warning for it

### Requirement: Saves stamp the version and never overwrite an unusable file

The package SHALL export a `writeConfigFile(path, document, version, fs)`
function that writes the document atomically with `version` as its first key,
replacing any `version` it holds, and an `updateConfigFile(options, update)`
function that reads the file again, passes its data (renamed keys moved, or `{}`
when missing) to `update`, and writes the result through `writeConfigFile`.
`updateConfigFile` SHALL throw without writing when the scope is a project Pi
does not trust, whether or not the file exists, and when the file is `invalid`.

#### Scenario: Saving to a missing file

- **WHEN** `updateConfigFile` saves to a scope with no file
- **THEN** the file holds the update's result with the current `version` first

#### Scenario: Saving over a malformed file or a newer version

- **WHEN** the file is not valid JSON or has another `version`
- **THEN** `updateConfigFile` throws
  `<path> is invalid (<reason>). Fix the file and try again.` and the file is
  unchanged

#### Scenario: Saving to an untrusted project

- **WHEN** `updateConfigFile` saves to the project scope of an untrusted project
- **THEN** it throws
  `The project is not trusted, so <path> was not saved. Trust the project and try again.`
  and writes nothing

### Requirement: Status reports show a Config block

The package SHALL export a `configFileWarnings(files)` function that returns the
warnings of every `invalid` and `untrusted` file in order, and a
`configStatusLines(files)` function that returns a `Config:` line followed, User
before Project, by each file's `alignLabelRows` row `<Scope>: <state>` and a
line holding its path aligned under the state. States SHALL read `loaded`,
`not found`, `invalid: <reason>`, and `skipped (untrusted)`.

#### Scenario: A loaded user file and an untrusted project file

- **WHEN** `configStatusLines` receives an untrusted project file and a loaded
  user file
- **THEN** it returns `Config:`, `  User:    loaded`, the user path indented by
  11 spaces, `  Project: skipped (untrusted)`, and the project path indented by
  11 spaces
