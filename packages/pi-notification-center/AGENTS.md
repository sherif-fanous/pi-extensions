# Agents

## Tasks

[mise](https://mise.jdx.dev/) is the task runner and provisions Node. See
`mise.toml` for the full list. `mise run check` is the pre-commit gate;
`mise run format` and `mise run lint-fix` fix most of what it reports.

## Conventions the linter cannot enforce

Every rule below has its rationale in the JSDoc of the module named
beside it. Read that before changing the behavior.

- **Interception stays exactly one seam** (`capture.ts`). The wrapper over
  the shared `ctx.ui.notify` is the only interception point, and it stays
  synchronous. Never widen a claim about what is captured: Pi core
  rendering, pre-activation calls, project-trust prompts, custom
  transcript messages, and separately created UI contexts are all out of
  scope.
- **The toast surface must never take focus, and never join the overlay
  stack late** (`tui-bridge.ts`). Both wedge other extensions' UI. It is
  created once at session start and toggled, never re-pushed.
- **Terminal layout uses the `pi-tui` width helpers** (`frame.ts`). Never
  `String.length`; ANSI escapes and wide characters break it. Truncate to
  the viewport as the final step, and omit presentation entirely rather
  than degrade it when the terminal is too small.
- **On-disk state is re-read, never cached** (`config.ts`), so `/reload`
  picks up edits. Pi session entries are the only durable history store
  (`history.ts`); module memory is never authoritative.
- **Invalid input resolves to a documented default plus a warning
  string.** Throw only for programmer errors.
- **Pure formatting is separated from rendering.** An exported function
  returns `string[]`; a thin component routes those lines. Tests assert on
  the function and never stub the TUI.

Every source file opens with a module JSDoc stating its role and what it
does not own. Keep it change-agnostic: no OpenSpec change names, no future
extension points. Comments explain why, not what.

## User-facing text

This is `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, notification and
warning text, overlay bodies, empty states, footer hints, and command
descriptions.

Run the `humanizer` and `unslop` skills over anything user-facing and
apply what they report. When unavailable, at minimum: no em or en dashes,
no AI stock vocabulary, no bold-label lists, active voice, sentence case.

Two audiences. `README.md` and `CHANGELOG.md` are for someone using the
extension: no internal names, event names, or mechanism, because a user
cannot act on `ctx.ui.notify`. `CONTRIBUTING.md` is for someone changing
the code, so technical terms belong there. The prose rules above apply to
both.

`Pi` is the product, `pi` the binary.
