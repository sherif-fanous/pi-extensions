# Agents

## Tasks

[mise](https://mise.jdx.dev/) is the task runner and provisions Node. See
`mise.toml` for the full list. `mise run check` is the pre-commit gate;
`mise run format` and `mise run lint-fix` fix most of what it reports.

## Code conventions

The conventions below are the ones the linter cannot enforce.

### Architecture

- Throw only for I/O failures and programmer errors. Anything a user can
  trigger, such as a validation error, a missing file, or malformed JSON, is an
  expected failure that comes back as a structured result or a warning.
- Keep no module-level caches of on-disk state. Re-reading on every call is
  deliberate because it makes `ctx.reload()` pick up an edit. Do not add a
  cache to shorten a hot path.
- Expose test seams as optional last parameters that default to the real
  implementation. Never reach for a DI container or an injection layer to make
  something testable.
- Add a detector by writing its implementation, listing it in the registries in
  `src/detectors/index.ts`, and adding the matching `detectAppearance` switch
  arm. Nothing else should need to change.
- `writeJson` is not atomic. The current single-writer, single-file pattern
  makes that acceptable. If concurrent writes become possible, replace it with
  an atomic write before extending the storage format.
- Expose new runtime state through `ThemeSyncRuntime` or `RuntimeStatus`, never
  through exported mutable bindings.
- `getTuiHandle` acquires Pi's live TUI through a transient zero-line
  `setWidget` factory because `ExtensionUIContext` does not expose the color
  scheme API. Keep the workaround isolated, acquire it once per
  `setupAppearanceMonitoring` call, and never cache the handle across
  sessions.

### Detection

- Pi's color scheme API is the primary terminal source. Pi owns DSR 996/997
  parsing and the notification lifecycle. Do not parse color scheme reports
  from raw terminal input.
- Write a raw terminal query only for OSC 11 polling and the DEC mode 2031
  DECRQM support probe. Route any new query through
  `queryWithTerminalListener` instead of adding a listener of your own.
- Prefer a subscription over polling. With a subscription active, the only
  timer is the low-frequency drift-correction interval, which catches a user
  changing Pi's theme by hand after we set it.
- Never disable terminal color scheme notifications. They are shared host state,
  and turning them off breaks Pi's own automatic theme controller. Cleanup
  removes this extension's listener and nothing else.

### Comments

Every source file opens with a module JSDoc: one or two sentences saying what
it does. Every exported function, type, and constant carries a short JSDoc
saying what it does. Do not list what a module is not responsible for, and do
not name sibling modules to disclaim them.

Skip `@param`, `@returns`, and `@throws` tags that restate the signature. Add a
second sentence to a doc block only when the caller needs it: an invariant to
uphold, a non-obvious return contract, or a host quirk.

Inline comments are rare. Write one only where the code cannot show the reason
on its own, such as an ordering constraint or a workaround for host behavior.
Delete anything that narrates the next line.

Comments describe the code as it stands today. Never write about what the code
used to do, why it changed, what a change was called, or where it might be
extended later. That history lives in Git and `CHANGELOG.md`.

Comment prose follows the same rules as user-facing text: sentence case,
complete sentences, no em or en dashes, and no AI stock vocabulary.

Lifecycle handlers (`session_start`, `session_shutdown`, and the `/theme-sync`
command handler) wrap their bodies in `try/catch`. Terminal queries and partial
reads can fail, and this extension must not block Pi's other extensions from
loading.

## User-facing text

This is `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, notification and warning
text, overlay bodies, status rows, footer hints, and command descriptions.

Run the `humanizer` and `unslop` skills over anything user-facing and apply what
they report. Without them, drop em and en dashes, AI stock vocabulary, and
bold-label lists, then write in active voice and sentence case.

Two audiences. `README.md` and `CHANGELOG.md` are for someone using the
extension, so leave out internal names, event names, and mechanism. A user
cannot act on `ctx.ui.notify`. `CONTRIBUTING.md` is for someone changing the
code, so technical terms belong there. The prose rules above apply to both.

Prose in notifications, dialog bodies, inline editor notices, warnings, and
lead sentences uses complete sentences with terminal periods. Single-line
labels do not carry one. Key/value labels in dialogs and status rows use Title
Case with a trailing colon, as in `Appearance:`, `Applied Theme:`, `Sync
Active:`, `Detection Strategy:`, and `Available Detectors:`. Editor form rows
and standalone titles use the same Title Case text without the colon. Button
and footer action labels use Title Case.

Detector strategy labels live in `DETECTOR_LABELS` in `src/runtime.ts`. Read
the label from there instead of repeating the text at a call site.

`Pi` is the product, `pi` the binary, and Pi command names stay literal:
`/theme-sync` and `/reload`.
