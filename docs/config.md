# Configuration

The standard for every configuration file. Core implements it (its README's
"Config API" section); never parse or write `config.json` by hand. Each
extension describes its file once with
`defineConfigFile({ extension, extensionName, version, renamedKeys, scopes })`
and uses only the handle it returns: `load`, `read`, `update`, `write`,
`migrateKeys`, and `path`. Every operation takes the handler context, so core
resolves the location and project trust itself.

- Files: one `config.json` per scope, at the handle's `path(ctx, scope)`: User
  at `<agentDir>/<slug>/config.json` and Project at
  `<cwd>/.pi/<slug>/config.json`, where `<agentDir>` is Pi's agent directory
  (`~/.pi/agent`, or `PI_CODING_AGENT_DIR`) and `<cwd>` is the directory Pi
  started in. `PI_CODING_AGENT_DIR` is the only way to move it, in tests too. An
  extension describes only the scopes it has (Notification Center has only
  User). Only a save or a migration creates a file. A missing file means the
  defaults, silently.
- Precedence: per key, Project, then User, then the default. Validate each
  scope's value before merging, so an invalid Project value falls back to a
  valid User value. An invalid value is dropped with a warning; an unknown key
  is ignored silently.
- Trust: read, migrate, and save a Project file only while
  `ctx.isProjectTrusted()` returns `true`. A Project file in an untrusted
  project gets the state `untrusted` and the warning
  `Skipped project configuration at <path> because the project is not trusted. Trust the project to use it.`
  An untrusted project without the file stays silent. `update` and `write`
  refuse to save to an untrusted project, and `migrateKeys` skips it. An old
  file an extension still counts as project configuration, such as Presets
  Plus's `presets.json`, goes in the description's `legacyFileNames`, so an
  untrusted project without `config.json` reports it as skipped.
- Versions: every file has a top-level integer `version`. A file without one is
  read as the current version, silently. A file with any other version, newer or
  unknown, is ignored with a warning and never overwritten. Every write puts the
  current version first (`update`, `write`). Bump the version in a release that
  renames keys or changes the file's shape.
- Keys: camelCase. Booleans are phrases without `is` (`syncEnabled`,
  `showInactiveStatus`). Durations and sizes name their unit (`timeoutMs`,
  `pollIntervalMs`). Related keys share an object (`toast.maxVisible`,
  `toast.timeoutMs`). Rename a key only together with its migration.
- Migration: old layouts and renamed keys migrate at session start, before the
  files are loaded. Write the new file atomically, and delete the old files only
  after that write succeeds. Never overwrite an existing new file: when it
  exists, leave the old files alone. When an old file can't be read or parsed,
  nothing in that scope migrates and a warning names the file. List renamed keys
  in the description's `renamedKeys`, so an old key is read while the new one is
  absent, and every save moves it. At session start, run the extension's layout
  migration (which writes through `write`), then `migrateKeys`, then `load`, and
  add both results to the outcome with `withMigrations`. Each result is a
  `ConfigMigration` (`{ migrated, warnings }`).
- Warnings: `load` returns an outcome holding the files, and the extension adds
  its invalid values with `withValueWarnings`. At session start it calls
  `outcome.notify(ctx, extras)` once, when it chooses: one info message names
  everything the session start migrated
  (`Theme Sync migrated its configuration to <path>.`), and one warning
  notification lists migration warnings, then file warnings, then invalid
  values, then `extras` (its other startup warnings). A command that reads the
  files again does not repeat them, with two exceptions: an explicit reload
  command such as `/presets reload` shows them again (`outcome.notify(ctx)`),
  because the user asked for a fresh read, and a command whose target failed to
  load shows the warnings that may explain why. A status report shows every
  current warning.
- Applying edits: an extension reads its configuration at session start, so Pi's
  `/reload` applies a hand edit. A command that re-reads in place, such as
  `/presets reload`, names the changes that still need `/reload`. A save that
  needs a reload says so where the save is confirmed and offers the reload (a
  `Ctrl+R Reload` hint in a form's footer, or a `Reload now?` confirmation after
  a save from a picker), which calls `ctx.reload()`. A failed reload reads
  `Could not reload Pi: <message>`.
- Status: every extension with a configuration file passes the outcome's
  `statusLines`, the `Config:` block, to `formatReport` as `config`, which puts
  it after the main rows and before `Warnings:`. Those list `statusWarnings`
  (migration warnings, then invalid values) and the extension's own. States read
  `loaded`, `not found`, `invalid: <reason>`, and `skipped (untrusted)`. File
  problems show there, not again under `Warnings:`.

  ```text
  Config:
    User:    loaded
             /Users/me/.pi/agent/theme-sync/config.json
    Project: skipped (untrusted)
             /repo/.pi/theme-sync/config.json
  ```

- Session entries: each custom entry type is a named constant, and its payload
  carries `version`; a payload without one reads as version 1.
- README: `## Configuration` has, in order: a `Scope | Path` table of the file
  locations, then the `PI_CODING_AGENT_DIR` note, the precedence rule, and the
  trust rule; an example `config.json` with `version` first and every setting at
  its default; a `Key | Default | Description` table, `version` first, with
  ranges in the description; an "Applying changes" paragraph
  (`Pi reads this file at session start. Run /reload after editing it.`, plus
  any in-extension reload); and a `### Migrating from <old version>` subsection
  per migration saying what moves, when, and what to do when it fails. An
  extension without a configuration file has one line under the heading instead,
  saying so and what it keeps instead
  (`RTK has no configuration file. /rtk enable and /rtk disable last until Pi restarts or you run /reload.`).
- Code: `src/config.ts`, split into `src/config/load.ts`, `migrate.ts`, and
  `save.ts` once it outgrows one file (Presets Plus keeps `src/store/`, which
  also holds preset CRUD). It exports `CONFIG_VERSION`, a named
  `DEFAULT_CONFIG`, one table of limits that validation and the README both use,
  the handle from `defineConfigFile`, and an async `loadConfig(ctx)`. Tests run
  against real temporary directories from `createTempConfigDirs`, which points
  `PI_CODING_AGENT_DIR` at its agent directory, with a
  `createProjectTrustContext`. Core's own tests cover trust, versions, renamed
  keys, and write failures, so an extension tests only its own values and
  migrations.
