## Context

`createThemeSyncRuntime()` in `src/runtime.ts` captures the session `ctx`
inside three long-lived closures created by `setupAppearanceMonitoring(ctx)`:

1. the polling `setInterval` whose callback does
   `resolvePollingAppearance(ctx, …).then(apply)`,
2. the DEC mode 2031 subscription callback, and
3. the drift-corrector `setInterval`.

Per Pi `docs/extensions.md` → "Session replacement lifecycle and footguns",
when a session is replaced (`/new`, `/fork`, `/clone`, `/resume`) or reloaded
(`/reload`), Pi tears down the old extension instance, emits `session_shutdown`,
and hard-invalidates that instance's `ctx`. Any subsequent access to
`ctx.ui` throws `assertActive` → an uncaught exception that exits Pi (issue #8).

`session_shutdown` already calls `runtime.cleanup()`, which clears the timers
and removes the DEC listener. That stops _new_ iterations but cannot recall a
continuation already queued on the microtask/macrotask queue: an in-flight
`resolvePollingAppearance` promise resolves _after_ `cleanup()` and its `.then`
touches the stale `ctx`. The doc's prescribed model is exactly what is missing:
"invalidate session-bound state in your `session_shutdown` handler, and assume
that state is gone in later continuations" — i.e. the runtime must gate every
async continuation on its own liveness.

Key lifecycle fact (docs lines 388/405): Pi **re-instantiates the extension per
replacement**, so a given `runtime` instance is bound to exactly one session
lifecycle (one `setupAppearanceMonitoring`, one `cleanup`, never reused).

## Goals / Non-Goals

**Goals:**

- A session replacement or reload during in-flight detection never crashes Pi
  (no uncaught exception, no unhandled rejection).
- Stale continuations discard their work instead of applying it to a replaced
  session.
- Fix is self-contained in `src/runtime.ts` with no public API or behavior
  change.

**Non-Goals:**

- Cancelling in-flight terminal queries promptly (an `AbortController` layer);
  a resolved-but-late promise still needs a liveness check, so cancellation is
  optional polish, not the fix.
- Using `withSession`; theme-sync never initiates the replacement, so that API
  does not apply.
- Any change to `src/index.ts` lifecycle wiring — it already calls
  `runtime.cleanup()` on `session_shutdown`.

## Decisions

### Decision: Per-instance boolean liveness flag over a monotonic epoch

Add a single `let isShutDown = false` in the runtime factory. `cleanup()` sets
`isShutDown = true`. Every long-lived continuation checks `if (isShutDown)
return;` before touching `ctx`.

- **Why a boolean, not an epoch counter?** Because Pi re-instantiates the
  extension per replacement, one runtime instance never re-binds to a second
  session. There is no "previous cycle" whose late promise could be
  mis-accepted after a reset, so the monotonic-epoch machinery that would guard
  against instance reuse is unnecessary. The boolean is the minimal correct
  encoding and matches the doc's "invalidate in shutdown, gate on it" model.
- **Alternative considered — monotonic epoch:** strictly more robust if a
  single runtime were reused across sessions, but that contradicts the
  documented lifecycle; rejected as over-engineering.
- **Alternative considered — shared `let activeCtx` re-pointed each setup:**
  rejected because a late continuation from the old cycle would then apply an
  old detection result to the new session — no crash, but wrong semantics.

The flag is checked synchronously before `ctx` use. Because `session_shutdown`
runs `cleanup()` synchronously before any queued task fires, every stale
continuation observes `isShutDown === true` and bails.

### Decision: Guard all four continuation sites, plus the loop interior

Guard points:

1. Top of the polling `.then` callback.
2. **Inside** `resolvePollingAppearance`, checked before each
   `detectAppearance(ctx, detector)` call — closes the mid-flight variant where
   an `await`-resumed loop otherwise calls `ctx.ui.onTerminalInput` on a stale
   `ctx`, producing an _unhandled rejection_ rather than an uncaught exception.
3. Top of the DEC mode 2031 subscription callback.
4. Top of the drift-corrector `setInterval` callback.

- **Why guard the loop interior and not just the `.then`?** The reported stack
  trace is the `.then`, but the loop's between-`await` window is a distinct
  failure path (rejection, not exception). Guarding only the `.then` would
  convert one crash class into another.

### Decision: Defensive `try/catch` backstop in `applyMappedTheme`

Wrap the `ctx.ui.theme.name` / `ctx.ui.setTheme` access in `applyMappedTheme`
in a `try/catch` that swallows the stale-`ctx` failure.

- **Why, given the flag already guards callers?** `setupAppearanceMonitoring`
  awaits its own initial detection and then calls `applyMappedTheme(ctx, …)`
  directly. If the session is replaced while that setup is mid-`await`, the
  instance's own `cleanup()` has not run yet, so the flag is still `false`.
  This narrow window is the one path the flag cannot cover, so the backstop
  handles it. It is belt-and-suspenders, not the primary mechanism.

## Risks / Trade-offs

- [A guard site is missed] → Enumerate the four sites explicitly in tasks and
  cross-check against the spec scenarios (one scenario per site).
- [`try/catch` masks a real, non-staleness `ctx.ui` bug] → Keep the backstop
  scoped to `applyMappedTheme` only; do not blanket-wrap unrelated `ctx` use.
  The flag remains the primary, intention-revealing mechanism.
- [Future refactor reuses a runtime instance across sessions] → Documented as a
  lifecycle assumption in the design and a code comment at the flag; if that
  assumption ever changes, revisit for a monotonic epoch.

## Migration Plan

Single-commit code change in `src/runtime.ts`; no data, config, or API
migration. Rollback is a straight revert. Verify with `mise run check`.

## Open Questions

- Should the drift-corrector and polling callbacks additionally short-circuit
  on `!ctx.hasUI` for defense in depth, or is the liveness flag sufficient?
  (Leaning: flag is sufficient; `hasUI` is orthogonal and already handled in
  `queryWithTerminalListener`.)
