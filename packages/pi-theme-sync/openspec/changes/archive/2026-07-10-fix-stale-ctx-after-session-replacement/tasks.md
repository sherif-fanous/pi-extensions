## 1. Liveness flag

- [x] 1.1 Add a per-instance `isShutDown` boolean to the `createThemeSyncRuntime()` factory scope in `src/runtime.ts`, with a comment noting the documented per-session-instance lifecycle assumption.
- [x] 1.2 Set `isShutDown = true` in `cleanup()` (after clearing timers and removing the DEC listener).

## 2. Guard the continuation sites

- [x] 2.1 Guard the polling `setInterval` `.then` callback: bail with no `ctx` access when `isShutDown` is true.
- [x] 2.2 Guard the `resolvePollingAppearance` detector loop: check `isShutDown` before each `detectAppearance(ctx, detector)` call and stop the pass when true (closes the mid-flight unhandled-rejection variant).
- [x] 2.3 Guard the DEC mode 2031 subscription callback: ignore the notification when `isShutDown` is true.
- [x] 2.4 Guard the drift-corrector `setInterval` callback: perform no comparison or application when `isShutDown` is true.

## 3. Backstop

- [x] 3.1 Wrap the `ctx.ui` access in `applyMappedTheme` in a `try/catch` that swallows the stale-`ctx` failure, covering the setup-mid-`await` window the flag cannot reach.

## 4. Verify

- [x] 4.1 Manually reproduce issue #8 (start with polling detection available and `isSyncActive: true`, trigger `/new` or `/reload` within one poll interval) and confirm Pi no longer exits.
- [x] 4.2 Run `mise run check` (format-check, type-check, lint) and confirm it passes.
- [x] 4.3 Confirm no user-facing behavior, config, or public API changed.
