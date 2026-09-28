# Writing code

Reach for `@sherif-fanous/pi-extensions-core` before writing a helper; see its
README for the full API.

- Layout: `src/index.ts` holds the default export, named after the extension
  (`rtk`, `themeSync`, `presetsPlus`, `notificationCenter`, `sessionSlice`) and
  returning `void`, which registers everything. Each slash command lives in
  `src/commands/<command>.ts`, or in `src/commands/<command>/` with its dispatch
  in `router.ts` when subcommands need modules of their own. Its entry point is
  `run<Command>Command(args, ctx, deps)`, where `deps` is one object holding
  anything else it needs, left out when it needs nothing. Overlays, dialogs, and
  pickers live in `src/ui/`. Library packages group `src/` by area (`config/`,
  `tui/`, `commands/`, `fakes/`), with only the entry point and cross-cutting
  helpers at the top level.
- Errors: `describeError` for thrown values. Register every command handler
  through `guardCommand("<Display Name>", handler)` and every `pi.on` handler
  that can throw through `guardEvent("<Display Name>", "<event>", handler)`, so
  failures read `<Display Name> command failed: …` or
  `<Display Name> <event> failed: …`. Display names: `Theme Sync`,
  `Presets Plus`, `Notification Center`, `Session Slice`, `RTK`. Don't notify
  from `session_shutdown`: Pi provides no UI during shutdown, so the handler
  swallows `dispose()` errors there instead.
- Session runtimes: Pi fires `session_start` again on reload and session
  switches, so dispose any previous runtime (timers, overlays, wrappers) before
  starting a new one, and dispose it on `session_shutdown`. A runtime's
  lifecycle methods are `startSession(ctx)` and `dispose()`; when each instance
  lasts one session, `startSession` is the static factory that creates it. If
  the start is async, `dispose()` must be able to abort it partway through (see
  theme-sync's `runtime.ts`). The `session_shutdown` handler calls `dispose()`
  inside `try { … } catch {}`, since it has no UI to report a failure to, then
  drops its reference to a per-session runtime. There is no shared helper for
  this, because the extensions' lifecycles differ.
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
- A function or method that acts is documented in the imperative:
  `Build a fake TUI …`, `Open the picker …`. One that returns a value or answers
  a question may instead name its result in a noun phrase:
  `Whether Pi is running …`, `The path to …`. Never use the third person
  (`Builds …`, `Returns …`). This covers functions exposed as constants or
  interface members too. Types, constants, and other properties get noun
  phrases.
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
