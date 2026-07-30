## Context

The extension currently owns four detectors: two terminal-protocol ones it
implements itself (`dsr-996` polling, `dec-mode-2031` subscription), plus
`osc-11` and `system`. The two terminal-protocol detectors read replies by
subscribing a `TerminalInputHandler` through `ctx.ui.onTerminalInput`.

`pi-tui@0.79.7` changed the dispatch order in `TUI.handleInput`:

```js
handleInput(data) {
    if (this.consumeOsc11BackgroundResponse(data)) return;
    if (this.consumeTerminalColorSchemeReport(data)) return;
    if (this.inputListeners.size > 0) { ... }   // extensions run here
}
```

`consumeTerminalColorSchemeReport` matches
`/^\x1b\[\?997;(1|2)n$/`, forwards the parsed scheme to
`terminalColorSchemeListeners`, and returns `true`. Extension listeners are
never reached, so `parseDsr997Reply` never sees a report. That kills
`dsr-996` outright and kills `dec-mode-2031` too, since its subscription
callback also parses DSR 997 replies.

The same release added the replacement surface on `TUI`:
`queryTerminalColorScheme({ timeoutMs })` (writes `\x1b[?996n`),
`onTerminalColorSchemeChange(listener)`, and
`setTerminalColorSchemeNotifications(enabled)` (writes `\x1b[?2031h` /
`\x1b[?2031l`). `TerminalColorScheme` is `"dark" | "light"`, which maps
directly onto the extension's `Appearance` minus `"unknown"`.

The constraint that shapes this design: `ExtensionUIContext` does not expose
any of it. Extensions only receive `ctx.ui`, and the color-scheme methods
live on `TUI`.

## Goals / Non-Goals

**Goals:**

- Restore working DSR 996/997 polling and 2031 subscription behavior on Pi
  0.79.7 and later.
- Stop the extension from competing with Pi's TUI for the same bytes.
- Delete the extension's own DSR 997 parsing and query plumbing.
- Keep `osc-11` and `system` as untouched fallbacks.
- Keep the change invisible in configuration and overlay surface, apart from
  detector names shown in Status.

**Non-Goals:**

- Special-casing terminal multiplexers. tmux 3.6 and later answer DSR 996
  directly (measured: tmux 3.7b replies `\x1b[?997;2n`), so they are served
  by the same color-scheme detector as any other terminal and need no
  separate path. Multiplexers older than 3.6 fall back to `osc-11` and
  `system` like any unsupported terminal.
- Supporting Pi below 0.79.7. See Decision 3.
- Changing the polling interval, drift-correction, or theme-mapping logic.
- Adding a test harness. The repo has none today and this change does not
  introduce one.

## Decisions

### Decision 1: Acquire the TUI handle via a transient widget factory

`ctx.ui.setWidget(key, factory)` invokes its factory synchronously with the
live TUI instance. From `interactive-mode.js`:

```js
// Factory function - create component
component = content(this.ui, theme);
```

So the handle can be captured and the widget removed again in two
synchronous calls:

```ts
let tui: TUI | undefined;
ctx.ui.setWidget(TUI_HANDLE_KEY, (candidate) => {
  tui = candidate;
  return { render: () => [], invalidate: () => {} };
});
ctx.ui.setWidget(TUI_HANDLE_KEY, undefined);
```

`Component` requires only `render(width): string[]` and `invalidate()`, so
an empty render is a legal no-op.

**Alternatives considered.** `setFooter` and `setHeader` also receive the
TUI but replace real chrome, which is far more intrusive for a handle grab.
`custom()` receives it too but shows a focused overlay and requires user
interaction.

Exposing the color-scheme methods on `ExtensionUIContext` would have removed
the need for any handle grab. That was requested upstream and declined, so
it is not a future migration path and this design does not assume one. The
widget round-trip is the permanent mechanism, not a stopgap.

That makes the accessor a long-lived liability rather than a temporary one,
which raises the bar on two things: it stays isolated in a single module
with a narrow return type, and its failure has to be observable (see
Decision 5) rather than silently degrading detection quality.

### Decision 2: Register the color-scheme detector in both registries

The same underlying API serves both strategy classes, but `AGENTS.md`
requires one source of truth per parallel structure, and `DETECTOR_LABELS`
is keyed on `PollingDetector | SubscriptionDetector`. A single shared id
cannot carry two labels. So two ids:

- `PollingDetector`: `"color-scheme"` replaces `"dsr-996"`, giving
  `"color-scheme" | "osc-11" | "system"`.
- `SubscriptionDetector`: `"color-scheme-subscription"` replaces
  `"dec-mode-2031"`.

Labels follow the existing human-readable convention: `"Terminal Color
Scheme"` and `"Terminal Color Scheme (subscription)"`.

Polling priority becomes `["color-scheme", "osc-11", "system"]`. The
color-scheme detector leads because it is an explicit protocol answer rather
than a luminance guess.

### Decision 3: Document the version boundary rather than encode it in peerDependencies

`peerDependencies` stays `"*"` for both Pi packages.

Narrowing it would accomplish nothing. Extensions are installed with
`pi install npm:...`, and Pi's package manager deliberately disables peer
resolution on every backend it supports (`core/package-manager.js`,
`getNpmInstallArgs`):

```
bun   → --omit=peer
pnpm  → --config.auto-install-peers=false
        --config.strict-peer-dependencies=false
npm   → --legacy-peer-deps
```

The comment at that call site is explicit that host-provided
`@earendil-works/pi-*` peers must not be solved by the package manager, and
`peerDependencies` appears nowhere else in Pi's distribution. A `>= 0.79.7`
range would therefore be inert at install time and actively misleading in
the manifest, because a later maintainer would read it as a guard that does
not exist.

A hard gate would also be the wrong behavior even if it worked. On Pi below
0.79.7 the color-scheme detectors report unavailable and `osc-11` /
`system` carry on, so the extension degrades rather than breaking. Refusing
to install would be a worse outcome than reduced detection quality.

The boundary is communicated three other ways:

- `devDependencies` move to `^0.79.7`, since that is what this code is
  written and type-checked against.
- README and CHANGELOG state that hosts below 0.79.7 should stay on
  `pi-theme-sync@0.3.x`, which still has working DSR 996 and DEC mode 2031
  detectors on those versions.
- The Decision 5 warning names the host Pi version at runtime. With no
  install-time guard available, that warning is the primary compatibility
  signal rather than a backstop.

Feature-detecting `typeof tui.onTerminalColorSchemeChange === "function"`
and shipping both detector stacks in one build was the other alternative.
Rejected: it means carrying the dead DSR 997 parsing indefinitely to serve
hosts that can simply pin `0.3.x`.

### Decision 4: Keep the DECRQM support probe

`probeDecMode2031Support` writes `\x1b[?2031$p` and parses `\x1b[?2031;N$y`.
That reply does not match Pi's anchored `/^\x1b\[\?997;(1|2)n$/`, so it
still reaches extension listeners through `ctx.ui.onTerminalInput`.

Keeping the probe means `Available Detectors:` stays honest: subscription is
advertised only when the terminal actually recognizes mode 2031. The
alternative, enabling notifications unconditionally and inferring support
from silence, would either advertise a detector that never fires or need a
timeout heuristic to retract it.

`dec-mode-2031.ts` therefore shrinks to the probe alone. Its enable/disable
lifecycle and DSR 997 listener are deleted, because
`setTerminalColorSchemeNotifications` now owns writing `\x1b[?2031h` and
`\x1b[?2031l`.

### Decision 5: Handle-grab failure surfaces as a user-visible warning

Because the accessor is unsupported and upstream has declined to sanction
it, a future Pi release can break it without notice. The failure mode is
quiet: the color-scheme detectors report unavailable, detection falls back
to `osc-11` luminance guessing, and the user sees slightly worse theme
tracking with no indication why.

The runtime already collects a `warnings: string[]` that the `/theme-sync`
Status overlay renders. When `ctx.hasUI` is true but the TUI handle cannot
be acquired, or the handle lacks the expected color-scheme methods, the
extension MUST push a warning naming the host Pi version. That converts a
silent regression into a visible one and gives any bug report the single
fact needed to diagnose it.

The alternative, throwing on a failed grab, is wrong: the graceful
degradation requirement in `theme-sync-detection` demands the remaining
detectors keep working.

### Decision 6: Treat terminal notifications as shared host state

The color-scheme subscription returns a one-method cleanup handle containing
the unsubscribe function from `onTerminalColorSchemeChange`. `cleanup()`
MUST remove that listener and MUST NOT call
`setTerminalColorSchemeNotifications(false)`.

Unlike the old DEC mode 2031 implementation, Pi and extensions share the
color-scheme notification channel. Pi's automatic theme controller caches
its own enabled state; if the extension disables the TUI flag, that cache can
prevent Pi from re-enabling notifications. Leaving notifications enabled
after removing the extension listener is harmless: Pi continues consuming
reports, and the extension receives no callbacks.

The TUI handle is acquired exactly once during each
`setupAppearanceMonitoring` call and threaded through startup probes,
subscription setup, and polling callbacks. It is never retained across
sessions. This avoids repeated widget registration and repaint requests
while preserving the stale-context protection from the
`fix-stale-ctx-after-session-replacement` change.

## Risks / Trade-offs

- **The widget handle-grab is off-label, permanent, and could break on any
  Pi upgrade.** Upstream declined to expose the API, so there is no
  sanctioned path to migrate to and no expectation that Pi will preserve
  this behavior. → Isolate it in one accessor module with a narrow return
  type; surface acquisition failure as a warning per Decision 5; keep the
  `osc-11` and `system` fallbacks so a break degrades detection quality
  rather than disabling the extension. Re-check the accessor whenever the
  Pi floor is raised.
- **No install-time compatibility guard exists at all.** Pi ignores
  `peerDependencies` by design, so nothing stops this being installed on Pi
  0.74 and quietly losing subscription updates. → The Decision 5 runtime
  warning is the only mechanism available, so it must name the host Pi
  version to make any resulting bug report actionable. Docs carry the rest.
- **Transient widget registration requests two renders.**
  `setExtensionWidget` calls `renderWidgets()` on both the add and the
  remove. A live TUI check confirmed that the zero-line component does not
  flicker. The handle is acquired only once per setup so polling does not
  create recurring repaint work.
- **Users on Pi below 0.79.7 lose subscription updates and DSR polling.**
  They keep `osc-11` and `system`, so theme sync still works, just less
  responsively and with a luminance guess instead of a protocol answer. →
  CHANGELOG and README direct them to pin `pi-theme-sync@0.3.x` until they
  upgrade Pi, and the Decision 5 warning tells them at runtime why
  detection changed.
- **Priority reorder changes the `Detection Strategy:` string users see.** →
  Unavoidable, since the detector it named no longer exists. Call it out in
  the CHANGELOG.
- **No automated tests cover this.** The repo has no test harness, so
  verification is manual across terminals. → Record the manual matrix
  (terminal, multiplexer, Pi version, expected strategy) in the tasks
  artifact so it is repeatable.

## Migration Plan

1. Land the source change with the new detectors and the raised floor.
2. Release as `0.4.0` with a CHANGELOG entry marked breaking, naming the
   minimum Pi version and the renamed detector strategies.
3. Users on Pi below 0.79.7 stay on `0.3.x`, which still works for them
   because their Pi has not yet moved DSR 997 onto the dedicated channel.

Rollback is a straight revert released as `0.4.1`. No manifest ranges,
persisted state, or config schema change, so there is nothing to migrate
back.

## Open Questions

None outstanding.

### Resolved

- **Does `VERSION` resolve to the running host or the build-time
  dependency?** The host. Measured in a live session against Pi 0.82.1 with
  the handle grab stubbed out: the Status overlay rendered `Terminal
color-scheme API is unavailable in Pi 0.82.1`, not the `0.79.7`
  devDependency. The Decision 5 warning is therefore a usable compatibility
  signal.
- **Does detection degrade gracefully when the handle is unavailable?** Yes.
  The same session showed `Detection Strategy: OSC 11`, `Available
Detectors: OSC 11, System Appearance`, and a correctly applied theme, so
  the `theme-sync-detection` degradation requirement holds.

- **Does the transient widget registration flicker?** No. `requestRender`
  defers through `process.nextTick` and both `setWidget` calls in
  `getTuiHandle` are synchronous, so no paint occurs while the placeholder
  is registered.
- **Does `queryTerminalColorScheme` resolve inside tmux?** Yes on tmux 3.6
  and later. tmux added mode 2031 in 3.6 and synthesizes a result from the
  background colour when the outer terminal lacks support. Measured on tmux
  3.7b: `\x1b[?996n` replies `\x1b[?997;2n`, and the reported `light` matched
  the terminal's actual appearance, so the answer is accurate and not just
  present.
