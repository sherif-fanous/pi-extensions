# Agents

## Tasks

[mise](https://mise.jdx.dev/) is the task runner and provisions Node. See
`mise.toml` for the full list. `mise run check` is the pre-commit gate;
`mise run format` and `mise run lint-fix` fix most of what it reports.

## Code conventions

The conventions below are the ones the linter cannot enforce.

### Architecture

- Wrap `ctx.ui.notify` in exactly one place, the intercepting function in
  `src/capture.ts`, and keep it synchronous so an emitting extension never
  awaits UI work. Never widen a claim about what it captures: Pi core
  rendering, calls made before this extension activates, project-trust
  prompts, custom transcript messages, and separately created UI contexts
  are all out of reach.
- Never let the toast surface take focus or join the overlay stack late.
  Either one breaks other extensions' UI. Create it once at session start
  through `setWidget` and toggle it hidden, never remove and re-push it.
- Measure terminal layout with the `pi-tui` width helpers, never
  `String.length`, because ANSI escapes and wide characters break
  character counts. Truncate to the viewport as the last step, and draw
  nothing rather than a broken frame when the terminal is too small.
- Re-read on-disk state and session state on every call. Keep no
  module-level caches, so `/reload` picks up an edit and no stale copy can
  drift from what is on disk. Pi session entries are the only durable
  history store; module memory is never authoritative.
- Resolve invalid input to a documented default and return a warning
  string. Throw only for programmer errors, such as a width below the two
  columns a border needs.
- Keep pure formatting separate from rendering. An exported function
  returns `string[]` for a given viewport and state; a thin component
  holds state and routes those lines. Tests assert on the function and
  never stub the TUI.

### Comments

Every source file opens with a module JSDoc: one or two sentences saying
what the module does. Every exported function, type, and constant carries
a short JSDoc saying what it does. Do not list what a module is not
responsible for, and do not name sibling modules to disclaim them.

Skip `@param`, `@returns`, and `@throws` tags that restate the signature.
Add a second sentence to a doc block only when the caller needs it: an
invariant to uphold, a non-obvious return contract, a host quirk.

Inline comments are rare. Write one only where the code cannot show the
reason on its own, such as an ordering constraint or a workaround for host
behavior. Delete anything that narrates the next line.

Comments describe the code as it stands today. Never write about what the
code used to do, why it changed, what a change was called, or where it
might be extended later. That history lives in Git and `CHANGELOG.md`.

Comment prose follows the same rules as user-facing text: sentence case,
complete sentences, no em or en dashes, no AI stock vocabulary.

## User-facing text

This is `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, notification and
warning text, overlay bodies, empty states, footer hints, and command
descriptions.

Run the `humanizer` and `unslop` skills over anything user-facing and
apply what they report. Without them, at minimum: no em or en dashes, no
AI stock vocabulary, no bold-label lists, active voice, sentence case.

Two audiences. `README.md` and `CHANGELOG.md` are for someone using the
extension: no internal names, event names, or mechanism, because a user
cannot act on `ctx.ui.notify`. `CONTRIBUTING.md` is for someone changing
the code, so technical terms belong there. The prose rules above apply to
both.

Prose in notifications, warnings, overlay bodies, and empty states uses
complete sentences with terminal periods. Single-line labels do not carry
one. Overlay and pane titles use Title Case without a colon, and a pane
title may carry a position suffix, as in `Detail 7-18/63`. Footer hints
pair a key with a Title Case action and join the pairs with ` · `, as in
`↑/↓ Select · Esc Close`. Key names match what the terminal prints.

`Pi` is the product, `pi` the binary, and Pi command names stay literal:
`/notifications`, `/reload`.
