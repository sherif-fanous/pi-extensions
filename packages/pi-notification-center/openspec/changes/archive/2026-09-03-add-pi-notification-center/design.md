## Context

See `proposal.md` for motivation and `specs/notification-center/spec.md` for observable behavior.

Pi 0.84.4 routes extension calls to `ctx.ui.notify` through a shared mutable `ExtensionUIContext`, but it does not expose a notification event or middleware hook. Its interactive implementation translates those calls into transcript status, warning, and error rows. Pi core messages call internal rendering methods directly, and some paths, including project trust and extension shortcut handling, create separate UI contexts.

Pi's custom UI callback exposes the active TUI instance and theme. The TUI can render a `nonCapturing` overlay that does not take input focus. Pi also supports custom session entries through `pi.appendEntry`, commands through `pi.registerCommand`, and reload-safe lifecycle cleanup through `session_shutdown`.

The package needs its own tooling baseline: a task runner, strict TypeScript, unit tests, linting, and formatting. It should stay small and carry only tooling this extension actually uses.

## Goals / Non-Goals

**Goals:**

- Keep the notification path synchronous from an emitting extension's perspective.
- Use one manager-owned passive overlay so stacking and cleanup stay deterministic, and never contend with another extension for focus or for a close action.
- Treat Pi session entries as the durable source of notification history.
- Keep configuration optional, global, and small enough to validate without a runtime dependency.
- Preserve strict TypeScript, focused unit tests, and routine quality gates.

**Non-Goals:**

- Intercept Pi core messages or UI contexts that do not use the wrapped shared function.
- Provide operating-system notifications, an LLM tool, a public toast event protocol, animation, or cross-session history.
- Reproduce `pi-toast` as a dependency or maintain compatibility with its `/toast` API.
- Add configuration editing UI or create the user's configuration file.

## Decisions

### Use one change for package setup and behavior

The repository scaffold and extension are one deliverable. A scaffold-only change would create no usable capability and would force later tasks to revise most of the same manifest, tooling, and documentation files.

The implementation will create the requested top-level structure:

```text
.gitignore
AGENTS.md
CHANGELOG.md
eslint.config.mjs
LICENSE
mise.toml
package.json
pnpm-workspace.yaml
README.md
tsconfig.json
vitest.config.ts
examples/
src/
tests/
```

The package manifest will publish `src`, documentation, license, changelog, and package metadata, and declare `./src/index.ts` in `pi.extensions`. Pi executes extension TypeScript directly, so the first release will not add a build step or generated `dist` directory.

Alternatives considered:

- Two OpenSpec changes: rejected because scaffolding is not independently valuable.
- Add dead-code and duplication auditing tooling: rejected because a package this small does not need it yet.

### Wrap only the shared TUI notification function

During `session_start` in TUI mode, the extension will retain the shared context's original `notify` function and replace it with a synchronous wrapper. The wrapper will normalize the missing type to `info`, append a session entry, and enqueue a toast without calling the original function. Other modes retain the original function.

The wrapper will be installed once per runtime and restored during shutdown when the shared context still points to that wrapper. This identity check avoids overwriting another extension that replaced the function later.

This is deliberately best-effort. The extension cannot reach Pi core rendering methods, calls made before its handler runs, project-trust UI, or fresh contexts created for some shortcut handlers. Custom transcript messages sent with `pi.sendMessage` are also unaffected, because they are conversation entries with their own renderer rather than notifications. The README will state this boundary.

TUI mode will be detected with `ctx.mode === "tui"`, the run mode Pi documents for guarding terminal-only UI. `ctx.hasUI` is insufficient because Pi reports it as `true` in RPC mode, where dialogs work over a JSON sub-protocol but every TUI-backed method is degraded or a no-op.

Alternatives considered:

- Pi event subscription: rejected because no notification event exists.
- Patching Pi internals: rejected because a package must work without modifying the installed application.
- Requiring other extensions to emit a custom event: rejected because it would not capture existing `ctx.ui.notify` callers.
- Gating on `ctx.hasUI`, or probing a degraded TUI-only method such as `getAllThemes()`: rejected because `ctx.mode` answers the question directly and is the documented guard.

### Separate durable history from transient presentation

Each captured notification will produce a custom session entry with a versioned payload:

```text
{
  version: 1,
  timestamp: number,
  severity: "info" | "warning" | "error",
  message: string
}
```

`pi.appendEntry` keeps these records out of model context. The extension will not register an entry renderer, so the entries remain absent from the chat transcript. The `/notifications` command will scan `ctx.sessionManager.getBranch()` each time it opens instead of treating module memory as authoritative. This naturally follows resumed sessions and tree branches.

The toast manager will hold only currently visible notifications and their timer handles. History remains complete even when a toast cannot render or is evicted from the visible stack.

Alternatives considered:

- A global JSONL file: rejected because the requested history can follow Pi's session model and does not need retention or locking policy.
- An in-memory history array: rejected because reload, resume, and branch navigation would make it stale.

### Render the stack in one passive top-right overlay

A manager-owned component will render all active toast cards inside one `nonCapturing` overlay anchored top-right, so an expired card disappears while the remaining cards compact immediately.

Two properties of that overlay are load-bearing, and both come from Pi's actual behavior rather than from the API surface:

**The bridge must not move focus.** The extension UI API does not expose `showOverlay`; only `ctx.ui.custom` and the factory form of `ctx.ui.setWidget` receive the live TUI instance. `setWidget` is used because it never touches focus. `ctx.ui.custom`'s non-overlay branch clears the editor container, focuses the supplied component, and restores focus to the core editor when it completes, so any component that already held focus is silently defocused and cannot regain it.

**The overlay must be created eagerly, at session start.** Pi's `hideOverlay()` pops the last-pushed stack entry without skipping `nonCapturing` overlays, unlike `getTopmostVisibleOverlay()`, and Pi's `ctx.ui.custom` close path calls `hideOverlay()` rather than the handle it was given. An overlay pushed _after_ another extension's overlay therefore consumes that overlay's next close: the other component keeps focus and stays on screen but can never close itself. Creating this package's overlay before any transient overlay exists keeps it permanently at the bottom of the stack, where every later overlay closes above it.

Consequently the surface is created once per runtime and never re-pushed. It starts hidden and is toggled with `setHidden` as the stack fills and empties, because leaving and re-entering the stack would forfeit its position. An unmatched `hideOverlay()` — for example during session invalidation — can still pop it, which degrades to history-only until the next session start recreates it.

The surface floats over the transcript, so the stack is bounded to half the terminal height in addition to `maxToastsVisible`. Cards are variable height, so the component measures each card and drops those that do not fit, keeping the newest, because a toast that has just arrived is the one the user is most likely waiting to read.

The component will render themed ASCII-safe framing, severity text, and the message wrapped across up to `toast.maxLines` body rows. It will use Pi TUI width helpers for ANSI-aware wrapping and truncation. It will not animate in the first release.

Messages keep their own line breaks: each paragraph is wrapped independently rather than the whole message being flattened first. A message that still needs more rows than `toast.maxLines` has its final rendered row marked with an ellipsis, and `/notifications` remains the complete record.

Alternatives considered:

- One `ctx.ui.custom` call per toast: rejected because calls overlap, capture focus by default, and remain active UI prompts until their timers finish.
- A single short-lived `ctx.ui.custom` bridge call: rejected because even one call defocuses the currently focused component and hands focus to the editor on completion.
- Creating the overlay lazily on the first toast: rejected because the first toast frequently arrives while another extension's overlay is open, which is exactly the case that consumes that overlay's close.
- Removing the overlay when the stack empties: rejected because re-pushing it later would place it above another extension's overlay.
- Skipping the toast whenever another overlay is already open: rejected because it is a timing guard that silently drops toasts during the interactions most likely to produce them.
- Rendering on a persistent `setWidget` surface instead of an overlay: rejected because a widget occupies real rows above the editor and cannot float over the transcript. It avoids the overlay stack entirely and remains the fallback if the eager-ordering guarantee ever stops holding.
- Collapsing every message to a single row: rejected because a multiline notification's first line is often only a summary, so flattening produces a jammed fragment that loses the useful text.
- Letting a card grow to the message's full height: rejected because one long notification could cover the transcript, and a passive card cannot be dismissed by hand.
- Reusing `pi-toast`: rejected because its public function awaits a single capturing overlay and has no shared stack manager.

### Use independent timers with bounded visible state

The manager will assign each captured notification its own timeout from arrival. When `maxToastsVisible` is exceeded, it will remove the oldest visible item and cancel that item's timer. Expiration updates the component and requests a render. When no cards remain, the manager will hide the surface without removing it from the overlay stack.

The manager will own all timers and clear them during `session_shutdown`. Timer callbacks will check a disposed flag before touching the TUI.

### Load and validate a small global JSON configuration

The extension will read `<agent-dir>/notification-center/config.json` on each `session_start`. It will use Pi's exported agent-directory helper rather than hardcoding `~/.pi/agent`.

Supported values and ranges:

| Setting            | Default |                    Valid range |
| ------------------ | ------: | -----------------------------: |
| `maxToastsVisible` |       5 |      integer from 1 through 10 |
| `toast.timeout`    |    3000 | integer from 250 through 60000 |
| `toast.maxLines`   |       5 |      integer from 1 through 20 |
| `toast.width`      |      50 |     integer from 20 through 80 |

Per-card appearance and lifetime are grouped under `toast` so the file states what each value governs; `maxToastsVisible` stays top level because it bounds the stack rather than any single card. Warnings name the dotted path, so a rejected value is reported as the user wrote it.

Unknown keys will be ignored for forward compatibility, at both levels. Missing files will be silent. Parse errors, a non-object `toast` section, and invalid supported values will produce one notification-center warning after initialization, using resolved defaults for invalid fields. The package will document an example but will not create or edit the file.

Alternatives considered:

- Environment variables: rejected because a JSON file is easier to discover and extend.
- Arbitrary keys in Pi settings: rejected because Pi does not expose extension-owned settings through a documented API.
- A schema dependency: rejected because three numeric fields need only a few explicit checks.

### Implement history as a two-pane browser

`/notifications` will open a focused custom overlay, because the user explicitly requested an interactive surface. A dedicated component will divide it into a list pane and a detail pane, in the shape of a picker with a preview:

- the list pane names every entry on the active branch, newest first, one row each, with a short time, a fixed-width severity label, and a single-line message preview;
- the detail pane shows the selected entry's full local date and time, its severity, and its complete message wrapped to the pane width;
- severities carry theme colors — `error` red, `warning` amber, `info` accent — in both panes, so urgency is readable at a glance rather than only from a word;
- the selected row is highlighted with the theme's selection background;
- movement, page movement, and cancel come from the injected Pi keybinding manager;
- a clear empty state replaces both panes when the branch holds no entries.

A one-line row cannot hold a long or multiline message, so the detail pane is what makes the complete text reachable. Selection keys move through the list and reset the detail scroll; page keys scroll the detail pane, since a long message is the only thing in the browser that can exceed the viewport.

Colors are applied through the theme rather than raw ANSI, so the browser follows the user's chosen theme. The selection background is applied last, after truncation: Pi's truncation helper emits a full SGR reset around its ellipsis, which would otherwise clear the background partway across a row.

Panes are sized from the overlay width, and the component keeps its own minimum so a narrow terminal degrades to a still-legible layout instead of a collapsed one. Because two panes need real width, the command requests an explicit overlay width instead of relying on Pi's default sizing. Content rows are bounded by the terminal height as well as by a maximum, so the frame's footer — which carries the only close hint — cannot be clipped.

The browser caps only rendered rows, never stored history, and recomputes both panes for the current terminal dimensions on every render.

Alternatives considered:

- A single scrolling list of full messages: rejected because scanning for one notification means scrolling past the complete text of every other one.
- Colorizing by prefixing severity words only: rejected because color is the property that makes severity scannable, and the theme already defines the three colors needed.
- A search or filter box: deferred. It is genuinely useful for long histories, but the requested capability is reading and reviewing, and the list is bounded by one session.

### Adapt the repository conventions selectively

The package will use pnpm, mise, strict TypeScript, Vitest, ESLint, Prettier, and Biome. `mise run check` will cover formatting, type checking, linting, and tests; `mise run pack-check` will add a dry-run package check.

`AGENTS.md` will carry only the conventions a reader cannot infer from the code itself: the interception boundary, focus and overlay-stack constraints, visual-width safety, user-facing text rules, Conventional Commits, and the manual TUI check. Rationale lives in each module's JSDoc, and `AGENTS.md` points at it rather than restating it.

Production dependencies are unnecessary. `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` will be peer dependencies and development dependencies for type checking and tests.

## Risks / Trade-offs

- [Pi has no supported interception hook] -> Document the exact capture boundary, isolate the wrapper behind tests, restore it safely, and keep the implementation small enough to replace if Pi adds an official event.
- [Extension load order can miss early notifications] -> Install during `session_start`, avoid claiming complete capture, and record this limitation in the README.
- [Another extension may also replace `ctx.ui.notify`] -> Chain only through the function present at activation and use identity-based restoration so shutdown does not clobber later wrappers.
- [The TUI bridge relies on the widget factory receiving the TUI instance] -> Keep that access in one adapter and degrade to history-only behavior when the surface cannot be created.
- [A focus-taking or late-pushed overlay can wedge another extension's UI] -> Obtain the TUI through the focus-neutral `setWidget` factory, create the overlay eagerly at session start so it stays below every transient overlay, toggle visibility instead of re-pushing, keep it in one adapter, and cover both hazards with regression tests.
- [Notifications may contain secrets] -> Keep records inside the existing Pi session rather than a new global log, and never send them to the model or the operating system. The README does not call this out separately, because Pi already persists the whole conversation and notifications are not a distinct exposure.
- [Hidden custom entries increase session size] -> Store only the version, timestamp, severity, and original message; avoid duplicate render metadata.
- [A malformed config warning passes through the system being initialized] -> Complete wrapper and manager setup first, then record one warning through the normal capture pipeline.
- [A toast can cover transcript text] -> Bound width, stack count, and total height, anchor at top-right, and omit presentation on terminals below safe dimensions.

## Migration Plan

1. Add the repository and package metadata, quality tooling, source modules, tests, and user documentation.
2. Validate with the full check task and a dry-run package archive inspection.
3. Test locally with `pi -e .` before publishing version `0.1.0`.
4. Publish under `@sherif-fanous/pi-notification-center` and install through Pi's package command.
5. To roll back, remove the package from Pi settings. Existing custom history entries remain inert session metadata because no renderer or command consumes them after removal.
