## Context

`src/command.ts` currently owns command flow, draft state, persistence, and rendering. It builds each view from `Container`, `DynamicBorder`, `Spacer`, `Text`, and `SelectList`. `DynamicBorder` supplies only horizontal rules, so the overlay has no complete window frame. Pi also clips component output at `maxHeight`; the current fixed list sizes can therefore hide the footer or bottom rule.

Theme sync already keeps runtime status behind `ThemeSyncRuntime.getStatus(ctx)` and delays applying saved configuration until reload. Those contracts remain unchanged. See the proposal and delta specs for the revised command behavior.

## Goals / Non-Goals

**Goals:**

- Use complete, width-safe framing across the configuration flow.
- Separate read-only status delivery from interactive configuration.
- Keep validation and recoverable persistence failures near the field or action that caused them.
- Preserve keyboard-only operation, draft state, save serialization, and reload ordering.
- Make rendering testable without starting Pi.

**Non-Goals:**

- Publish a shared UI package.
- Add mouse controls, live theme previews, theme search, or new configuration fields.
- Apply saved configuration before reload.
- Change detection, persistence, or configuration precedence.
- Upgrade Pi dependencies solely for this UI change.

## Decisions

### Route the bare command to config and status to a subcommand

The registered command will trim its argument and dispatch an empty argument to the configuration overlay and `status` to status reporting. Unknown arguments will produce a concise usage warning as an expected user error. The command handler will retain its lifecycle `try/catch` so an I/O failure cannot disrupt Pi startup.

This removes the two-item landing menu and follows the existing command-report convention. Keeping a menu or adding Config and Status tabs would preserve more of the current flow, but both retain interaction that a read-only report does not need.

### Deliver status as a durable transcript entry

A pure formatter will turn `RuntimeStatus` into a report body. In TUI mode, theme sync will append a namespaced custom entry and render it with an accent heading, muted labels, and warning-colored warning rows. Outside TUI mode, it will send the same formatted content through `ctx.ui.notify`.

A transcript entry is preferable to an overlay because status requires no interaction and remains available after the command completes. The renderer will store plain report data and apply the active theme at render time so theme changes and session restoration do not preserve stale ANSI codes.

### Render one complete frame around every config view

Repository-local frame helpers will use Pi's visual-width utilities to produce top and bottom segments, bordered content rows, padding, truncation, and ANSI-safe wrapping. Borders will use plain box-drawing characters. Ordinary titles will be the only accent-colored text in the frame header. Selection, success, warning, and error colors remain semantic content styles.

The main view and each nested view will render through the same frame function. A section rule will separate content from the footer. This replaces `DynamicBorder` and spacer-based chrome without introducing a general UI framework.

### Keep Pi list components inside the frame

Theme, sync status, and write-target choices will continue to use `SelectList`. The overlay will ask each active list to render at the frame's inner width, then wrap each returned line in side borders. Existing selection behavior and configured Pi list keybindings are retained.

List capacity will be derived from the current terminal row count after reserving frame chrome and message rows. If the terminal height changes, rebuilding a list will preserve its selected value. This keeps the bottom frame visible while avoiding a custom list implementation.

### Use a focused component for polling input

The configuration overlay component will implement `Focusable` and propagate focus to a Pi `Input` while Polling Interval is active. Opening the editor will seed the current value and place the cursor at the end. Enter validates and stages the value; Escape returns without changing the draft.

A real `Input` provides cursor positioning, standard editing behavior, and IME support. Extending the manual digit and backspace handler would leave those behaviors incomplete.

### Keep recoverable errors inline

Polling validation, path resolution, and save refusal messages will render inside the current frame. Error messages use `error`, warnings use `warning`, and successful saves use `success`. Wrapping will preserve indentation and styling on every line. The draft remains in memory and input stays available after a recoverable failure.

If an action requires a nested error dialog, the host overlay will be hidden while a complete framed dialog is active, then restored and focused in `finally`. Error dialogs use a semantic title color, wrapped body text, and a contained dismissal footer. No new dialog will be introduced where inline feedback is sufficient.

### Split orchestration from presentation at narrow seams

`src/command.ts` will retain loading, saving, reload sequencing, and command-facing orchestration. UI code will live under `src/ui/`:

- `frame.ts` for pure frame and width helpers.
- `config-overlay.ts` for overlay state, focused input, and rendering.
- `status-report.ts` for status formatting, custom entry rendering, and delivery.

The overlay receives callbacks for save-target resolution, persistence, reload request, and runtime-independent data. This is a direct seam between I/O and presentation, not a dependency injection layer.

## Risks / Trade-offs

- [Exact frame tests can become noisy when copy changes] → Assert structural rows and focused user-facing strings, with dedicated helper tests for exact width behavior.
- [A very short terminal may not have enough rows for useful content] → Reserve chrome first, clamp list capacity to at least one row, and let the overlay use its configured height ceiling.
- [Rebuilding `SelectList` after a resize can reset transient selection] → Read the selected value before rebuilding and restore its index afterward.
- [Transcript status entries add a new persisted custom entry type] → Store only serializable plain data and register the renderer during theme sync setup before status can be invoked.
- [Moving state out of `src/command.ts` can disturb save locking or reload ordering] → Preserve the existing busy guard and continue closing the overlay before awaiting `ctx.reload()`.

## Migration Plan

1. Register the status entry renderer and argument router while preserving the existing runtime and persistence APIs.
2. Replace the menu entrypoint with direct configuration opening and add status report delivery.
3. Replace overlay chrome and polling editing with the framed component.
4. Run focused UI tests and the repository pre-commit gate.

Rollback consists of reverting this change. Configuration files and session runtime state require no migration. Previously stored sessions remain valid; only sessions containing the new status report entry depend on its renderer for themed display.
