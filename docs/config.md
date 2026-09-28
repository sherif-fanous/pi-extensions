# Configuration

The standard for every configuration file. Core implements it (its README's
"Config API" section); never parse or write `config.json` by hand.

- Files: one `config.json` per scope, located by `configFilePath`: User at
  `<agentDir>/<slug>/config.json` and Project at `<cwd>/.pi/<slug>/config.json`,
  where `<agentDir>` is Pi's agent directory (`~/.pi/agent`, or
  `PI_CODING_AGENT_DIR`) and `<cwd>` is the directory Pi started in. An
  extension reads only the scopes it has (Notification Center has only User).
  Only a save or a migration creates a file. A missing file means the defaults,
  silently.
- Precedence: per key, Project, then User, then the default. Validate each
  scope's value before merging, so an invalid Project value falls back to a
  valid User value. An invalid value is dropped with a warning; an unknown key
  is ignored silently.
- Trust: read, migrate, and save a Project file only while
  `ctx.isProjectTrusted()` returns `true`. A Project file in an untrusted
  project gets the state `untrusted` and the warning
  `Skipped project configuration at <path> because the project is not trusted. Trust the project to use it.`
  An untrusted project without the file stays silent. `updateConfigFile` refuses
  to save to an untrusted project.
- Versions: every file has a top-level integer `version`. A file without one is
  read as the current version, silently. A file with any other version, newer or
  unknown, is ignored with a warning and never overwritten. Every write puts the
  current version first (`updateConfigFile`, `writeConfigFile`). Bump the
  version in a release that renames keys or changes the file's shape.
- Keys: camelCase. Booleans are phrases without `is` (`syncEnabled`,
  `showInactiveStatus`). Durations and sizes name their unit (`timeoutMs`,
  `pollIntervalMs`). Related keys share an object (`toast.maxVisible`,
  `toast.timeoutMs`). Rename a key only together with its migration.
- Migration: old layouts and renamed keys migrate at session start, before the
  files are loaded. Write the new file atomically, and delete the old files only
  after that write succeeds. Never overwrite an existing new file: when it
  exists, leave the old files alone. When an old file can't be read or parsed,
  nothing in that scope migrates and a warning names the file. Pass renamed keys
  to `loadConfigFiles` as `renamedKeys`, so an old key is read while the new one
  is absent, then call `migrateRenamedConfigKeys` to rewrite those files. One
  info message from `configMigratedMessage` covers everything one session start
  migrated (`Theme Sync migrated its configuration to <path>.`).
- Warnings: an extension shows its configuration warnings once per session, at
  `session_start`, in one `notifyWarnings` call: migration warnings, then
  `configFileWarnings`, then invalid values. A command that reads the files
  again does not repeat them, with two exceptions: an explicit reload command
  such as `/presets reload` shows them again, because the user asked for a fresh
  read, and a command whose target failed to load shows the warnings that may
  explain why. A status report shows every current warning.
- Applying edits: an extension reads its configuration at session start, so Pi's
  `/reload` applies a hand edit. A command that re-reads in place, such as
  `/presets reload`, names the changes that still need `/reload`. A save that
  needs a reload says so where the save is confirmed and offers the reload (a
  `Ctrl+R Reload` hint in a form's footer, or a `Reload now?` confirmation after
  a save from a picker), which calls `ctx.reload()`. A failed reload reads
  `Could not reload Pi: <message>`.
- Status: every extension with a configuration file puts the `Config:` block
  from `configStatusLines` in its status report, after the main rows and a blank
  line, and before `Warnings:`. States read `loaded`, `not found`,
  `invalid: <reason>`, and `skipped (untrusted)`. File problems show there, not
  again under `Warnings:`.

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
  and an async `loadConfig` that takes `agentDir` (plus a file-system seam where
  a failure needs simulating), so tests run against real temporary directories
  from `createTempConfigDirs` with a `createProjectTrustContext`.
