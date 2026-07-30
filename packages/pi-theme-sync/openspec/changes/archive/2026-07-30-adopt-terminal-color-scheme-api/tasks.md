## 1. Dependency floor

- [x] 1.1 Leave both `peerDependencies` entries at `"*"` and add a short comment or CHANGELOG note recording why, per design Decision 3, so a later maintainer does not "fix" them into a range Pi ignores
- [x] 1.2 Raise both `devDependencies` entries from `^0.74.0` to `^0.79.7`, run `pnpm install`, and commit the regenerated lockfile
- [x] 1.3 Confirm the installed `pi-tui` exposes `queryTerminalColorScheme`, `onTerminalColorSchemeChange`, and `setTerminalColorSchemeNotifications` on `TUI`
- [x] 1.4 Run `mise run type-check` against the upgraded packages and record any unrelated breakage before touching detector code

## 2. TUI handle accessor

- [x] 2.1 Add `src/detectors/pi/tui-handle.ts` with a module JSDoc block stating what it owns and does not own, per the repo documentation convention
- [x] 2.2 Implement the transient `ctx.ui.setWidget` grab-and-release from design Decision 1, returning `TUI | undefined` and guarding on `ctx.hasUI`
- [x] 2.3 Add an inline comment explaining why the widget round-trip exists, so the off-label call is not mistaken for an accident
- [x] 2.4 Verify by manual run that registering and immediately removing the zero-line widget produces no visible flicker; if it does, move acquisition to `session_start` per the design risk note

## 3. Color-scheme detector

- [x] 3.1 Add `src/detectors/pi/color-scheme.ts` with a module JSDoc block
- [x] 3.2 Implement `detectAppearanceViaColorScheme(tui)` wrapping `queryTerminalColorScheme({ timeoutMs })`, mapping `"light" | "dark"` to `Appearance` and a timeout to `"unknown"`
- [x] 3.3 Implement `enableColorSchemeSubscription(tui, onAppearanceDetected)` that calls `setTerminalColorSchemeNotifications(true)`, registers `onTerminalColorSchemeChange`, and returns a one-method listener cleanup handle per design Decision 6
- [x] 3.4 Return `"unknown"` from polling and `undefined` from subscription setup when the TUI handle or API is unavailable, so the graceful-degradation requirement holds

## 4. Registry and type changes

- [x] 4.1 In `src/types.ts`, replace `"dsr-996"` with `"color-scheme"` in `PollingDetector` and `"dec-mode-2031"` with `"color-scheme-subscription"` in `SubscriptionDetector`
- [x] 4.2 In `src/detectors/index.ts`, set `POLLING_DETECTORS` to `["color-scheme", "osc-11", "system"]` and `SUBSCRIPTION_DETECTORS` to `["color-scheme-subscription"]`
- [x] 4.3 Update the `detectAppearance` switch to dispatch `"color-scheme"`, accept the setup-local TUI handle, and drop the `"dsr-996"` arm
- [x] 4.4 Update `probeAvailableSubscriptionDetectors` to gate `"color-scheme-subscription"` on the retained DECRQM probe, per design Decision 4
- [x] 4.5 Update the module JSDoc in `src/detectors/index.ts` to reflect the new detector set

## 5. Runtime wiring

- [x] 5.1 In `src/runtime.ts`, replace the `dec-mode-2031` entries in `DETECTOR_LABELS` with `"color-scheme": "Terminal Color Scheme"` and `"color-scheme-subscription": "Terminal Color Scheme (subscription)"`
- [x] 5.2 Replace the `enableDecMode2031Subscription` call site with `enableColorSchemeSubscription`, keeping the existing `isShutDown` guard in the callback
- [x] 5.3 Update `cleanup()` to unsubscribe only the extension's color-scheme listener without disabling Pi's shared terminal notifications, per design Decision 6
- [x] 5.4 Acquire the TUI handle exactly once per `setupAppearanceMonitoring` call, thread it through detection, and never cache it across sessions, per design Decision 6
- [x] 5.5 Push a warning onto the runtime `warnings` array naming the host Pi version when `ctx.hasUI` is true but the TUI handle cannot be acquired or lacks the color-scheme methods, per design Decision 5
- [x] 5.6 Confirm the warning renders in the `/theme-sync` Status overlay alongside existing warnings, and that detection still falls back to `osc-11` / `system` rather than failing
- [x] 5.7 Update the drift-corrector interval to re-query the color scheme rather than only re-applying the cached mapping, re-checking `isShutDown` after the await, and refresh its rationale comment so the subscription self-heals when Pi disables the shared notification flag mid-session

## 6. Delete superseded code

- [x] 6.1 Delete `src/detectors/terminal/dsr-996.ts` including `parseDsr997Reply` and the DSR 996 query constant
- [x] 6.2 Reduce `src/detectors/terminal/dec-mode-2031.ts` to `probeDecMode2031Support` and `parseDecMode2031Decrqm`, deleting the enable/disable lifecycle, the `DecMode2031Subscription` type, and the DSR 997 listener
- [x] 6.3 Update the remaining module JSDoc in `dec-mode-2031.ts` so it describes a support probe rather than a subscription detector
- [x] 6.4 Confirm `queryWithTerminalListener` still has callers (`osc-11` and the DECRQM probe) and leave it in place
- [x] 6.5 Run `mise run fallow-dead-code` and confirm no orphaned exports remain from the deleted detectors

## 7. Documentation

- [x] 7.1 Rewrite the "Detection layering" section of `AGENTS.md` to describe the color-scheme detectors, the retained DECRQM probe, and the surviving `osc-11` / `system` fallbacks
- [x] 7.2 Add the TUI-handle accessor to the `AGENTS.md` architecture notes, recording that the `setWidget` route is off-label, that upstream declined to expose the API, and that it must be re-checked whenever the Pi floor is raised
- [x] 7.3 Update `README.md` with the supported Pi floor, the renamed detection strategies, and an explicit instruction to pin `pi-theme-sync@0.3.x` when running Pi below 0.79.7
- [x] 7.4 Add a `0.4.0` CHANGELOG entry marked as breaking, naming the supported Pi floor, the `0.3.x` pin for older hosts, the removed detectors, and the new `Detection Strategy:` strings
- [x] 7.5 Bump `version` in `package.json` to `0.4.0`

## 8. Verification

- [x] 8.1 Run `mise run check` and confirm format-check, type-check, and lint all pass
- [x] 8.2 Run `mise run pack-check` and confirm the package still packs cleanly
- [x] 8.3 Manual matrix: confirm `Detection Strategy:` shows `Terminal Color Scheme (subscription)` in a 2031-capable terminal, and that switching the OS or terminal theme flips Pi's theme in real time
- [x] 8.4 Manual matrix: confirm a terminal without mode 2031 falls back to polling and still resolves via `Terminal Color Scheme` or `OSC 11`
- [x] 8.5 Manual matrix: confirm `/reload` and `/new` re-acquire the handle and do not raise an uncaught exception, covering the session-replacement scenarios in the `theme-sync-extension` delta
- [x] 8.6 Confirm that installing on a Pi below 0.79.7 succeeds, falls back to `osc-11` / `system`, and raises the Decision 5 warning naming the host version rather than failing or silently degrading
- [x] 8.7 Run `openspec validate adopt-terminal-color-scheme-api` and confirm the change is still valid

## 9. Review remediation

- [x] 9.1 Preserve Pi's shared terminal-notification state by removing only the extension listener during cleanup
- [x] 9.2 Eliminate recurring widget round-trips by threading one setup-local TUI handle through probes, polling, and subscription setup
- [x] 9.3 Rename the subscription cleanup method to `removeColorSchemeListener`
- [x] 9.4 Restore the polling detector contract to `Promise<Appearance>` with `"unknown"` for API unavailability
- [x] 9.5 Use `hasColorSchemeApi` consistently for polling, subscription setup, and subscription probing
- [x] 9.6 Document coexistence with Pi's built-in `auto:light,dark` mode
- [x] 9.7 Reuse `DEFAULT_TERMINAL_QUERY_TIMEOUT_MS` for the Pi color-scheme query
- [x] 9.8 Flatten `getTuiHandle` error handling while preserving best-effort widget removal
- [x] 9.9 Correct the stale detection-layer wording in `AGENTS.md`
- [x] 9.10 Confirm in a live Pi loader run that imported `VERSION` resolves to the host (`0.82.1`) rather than the devDependency (`0.79.10`)
- [x] 9.11 Re-run checks, pack verification, dead-code audit, and OpenSpec validation

## 10. Round-two review remediation

- [x] 10.1 Make the color-scheme subscription self-healing against Pi disabling the shared notification flag mid-session (implemented under 5.7)
- [x] 10.2 Keep the captured TUI handle when placeholder-widget removal fails, instead of discarding a valid handle and still leaking the widget
- [x] 10.3 Document on `detectAppearance` that each arm consumes exactly one of `ctx` or `tui`
- [x] 10.4 Document in `README.md` that the extension and Pi's built-in `auto:light,dark` setting are alternatives, and how to return to Pi's built-in behavior
- [x] 10.5 Record the resolved widget-flicker, tmux DSR 996, `VERSION` host-resolution, and graceful-degradation questions in `design.md`, leaving no open questions
- [x] 10.6 Re-run `mise run check`, `mise run pack-check`, `fallow dead-code`, and `openspec validate` after the round-two fixes
