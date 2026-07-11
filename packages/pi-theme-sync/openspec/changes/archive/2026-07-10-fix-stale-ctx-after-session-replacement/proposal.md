## Why

`pi-theme-sync@0.3.0` crashes Pi with an `uncaughtException` when a session
is replaced (`/new`, `/fork`, `/clone`, `/resume`, `/reload`) while a polling
or subscription detection is in flight. The runtime bakes the session's `ctx`
into three long-lived closures; after `session_shutdown`, Pi hard-invalidates
that `ctx`, so any in-flight continuation that touches `ctx.ui` throws into an
uncaught exception and takes Pi down with it (issue #8). Pi's own extension
docs prescribe the fix: invalidate session-bound state in `session_shutdown`
and gate async continuations on it — the runtime does not currently do this.

## What Changes

- The runtime tracks a per-instance liveness flag that `cleanup()` (invoked by
  the `session_shutdown` handler) sets, and every long-lived async
  continuation checks that flag before touching `ctx`, bailing out when the
  instance has been torn down.
- All four `ctx`-capturing continuation sites are guarded: the polling
  `setInterval` result callback, the `resolvePollingAppearance` detector loop
  (between `await`s, to close the mid-flight unhandled-rejection variant), the
  DEC mode 2031 subscription callback, and the drift-corrector `setInterval`.
- `applyMappedTheme` gains a defensive `try/catch` backstop around its `ctx.ui`
  access to cover the narrow window where `setupAppearanceMonitoring` is itself
  mid-`await` when its `ctx` is replaced before `cleanup()` runs.
- No user-facing behavior, config, or public API changes; this is a
  robustness/crash fix.

## Capabilities

### New Capabilities

<!-- None. This is a robustness fix to existing lifecycle behavior. -->

### Modified Capabilities

- `theme-sync-extension`: adds a requirement that in-flight detection and
  theme-application work MUST NOT use a session `ctx` after the session has
  been replaced, so session replacement during active detection never crashes
  Pi.

## Impact

- Affected code: `src/runtime.ts` (liveness flag, guards at the four
  continuation sites, `applyMappedTheme` backstop). `src/index.ts` unchanged —
  its `session_shutdown` handler already calls `runtime.cleanup()`.
- No dependency, config-schema, or command-surface changes.
- Reference: Pi `docs/extensions.md` → "Session replacement lifecycle and
  footguns" (extensions are re-instantiated per replacement; a per-instance
  liveness flag is sufficient — no monotonic epoch needed). `withSession` does
  not apply because theme-sync never initiates the replacement.
