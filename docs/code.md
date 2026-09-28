# Writing code

Reach for `@sherif-fanous/pi-extensions-core` before writing a helper; see its
README for the full API.

- Errors: `describeError` for thrown values. Register every command handler
  through `guardCommand("<Display Name>", handler)` and every `pi.on` handler
  that can throw through `guardEvent("<Display Name>", "<event>", handler)`, so
  failures read `<Display Name> command failed: …` or
  `<Display Name> <event> failed: …`. Display names: `Theme Sync`,
  `Presets Plus`, `Notification Center`, `Session Slice`, `RTK`. Don't notify
  from `session_shutdown`: Pi provides no UI during shutdown, so theme-sync
  swallows cleanup errors there instead.
- Session runtimes: Pi fires `session_start` again on reload and session
  switches, so dispose any previous runtime (timers, overlays, wrappers) before
  starting a new one, and dispose it on `session_shutdown`. If setup is async,
  its cleanup must be able to abort it partway through (see theme-sync's
  `runtime.ts`). There is no shared helper for this, because the extensions'
  lifecycles differ.
- Config: `loadConfigFiles` or `readConfigFile` to read `config.json`,
  `updateConfigFile` to save it, and the rest of [config.md](config.md). Other
  files, such as an old layout a migration reads, use `extensionConfigPath` and
  `projectConfigPath` for locations, `parseJsonObject` to read, and
  `writeJsonFile` (atomic) to save.
- Reports: `createCommandReport` to show a command's report (transcript entry in
  TUI mode, notification otherwise), `styleReport` for other surfaces,
  `alignLabelRows` for `Label: value` rows.
- Completions: `subcommandCompletions([{ name, description? }])` for fixed
  subcommands.
- Mode checks: `isInteractiveTui(ctx)` rather than comparing `ctx.mode`.
- Tests: use the doubles in `@sherif-fanous/pi-extensions-testing` instead of
  hand-rolled fakes.
- Dependencies: Pi packages (`@earendil-works/pi-*`) are dev dependencies at
  `catalog:`, so a Pi upgrade is one bump in `pnpm-workspace.yaml`. Published
  packages list them as `peerDependencies` at `"*"`.
- A new shared helper belongs in core only when it replaces code duplicated in
  existing extensions, and lands with the callers that switch to it.
- Failures: throw only for I/O failures and programmer errors. Anything a user
  can trigger (a validation error, a name collision, a missing file, malformed
  JSON) is an expected failure that comes back as a structured result, a
  `reason` string, or a warning, however sensible an exception would look at the
  call site.
- Warnings: return them up to the UI boundary and show the ones a call produced
  in one notification there. Never notify per warning, and never from a layer
  below the boundary.
- State: keep no module-level caches of on-disk state. Re-reading on every call
  is what makes `/reload` and `ctx.reload()` pick up an edit, so don't add a
  cache to shorten a hot path.
- One source of truth: when two places must agree on a list, such as
  autocomplete and dispatch, define one `as const` registry and use it from
  both. Nothing fails at compile time when two copies drift apart.
- Test seams: optional last parameters that default to the real implementation,
  such as the file system on a writer or `agentDir` on a path helper. Never a DI
  container or an injection layer.

## Comments

- Every source file opens with a module JSDoc: one or two sentences saying what
  the module does. Every exported function, type, and constant carries a short
  JSDoc saying what it does. Don't list what a module is not responsible for,
  and don't name sibling modules to disclaim them.
- Skip `@param`, `@returns`, and `@throws` tags that restate the signature. Add
  a second sentence to a doc block only when the caller needs it: an invariant
  to uphold, a non-obvious return contract, or a host quirk.
- Inline comments are rare. Write one only where the code can't show the reason
  on its own, such as an ordering constraint or a workaround for host behavior.
  Delete anything that narrates the next line.
- Comments describe the code as it stands. Never write about what it used to do,
  why it changed, what a change was called, or where it might be extended later;
  that history lives in Git and the changelogs.
- Comment prose follows the prose rules in [text.md](text.md).
