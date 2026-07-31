## 1. Widen the drift-correction re-query

- [x] 1.1 In the drift-correction interval in `src/runtime.ts`, replace `detectAppearanceViaColorScheme(tui)` with `resolvePollingAppearance(ctx, tui, availablePollingDetectors)`
- [x] 1.2 Keep the post-`await` `isShutDown` re-check that the `theme-sync-extension` session-replacement guard depends on
- [x] 1.3 Update the interval's explanatory comment to state why the full chain is queried (hosts may answer a lower-priority detector only)

## 2. Demote a non-functional subscription

- [x] 2.1 Add closure-level demotion, missed-change, and poll-cycle state in `createThemeSyncRuntime`
- [x] 2.2 When polling observes a new appearance first, apply it immediately and record the missed change instead of demoting in the same continuation
- [x] 2.3 Clear the missed-change flag when the subscription reports any appearance before the next drift cycle, since any report establishes liveness
- [x] 2.4 At the start of the next drift cycle, demote if the missed change is still unreported
- [x] 2.5 On demotion, remove the extension's own subscription listener via the existing cleanup handle without disabling the shared terminal notification channel
- [x] 2.6 On demotion, rebuild `availableDetectors` from the polling detector list rather than filtering on the rendered label
- [x] 2.7 On demotion, let `detectionStrategy` report the concrete polling detector, falling back to `Polling` when no detector has answered
- [x] 2.8 On demotion, push exactly one warning: `Terminal color-scheme notifications stopped arriving, so theme sync switched to polling.`
- [x] 2.9 Ensure the subscription callback cannot re-assign `detectionStrategy` back to the subscription label after demotion
- [x] 2.10 On demotion, call `markEvent` so the status overlay timestamps the fallback
- [x] 2.11 Extract the demotion into one named helper so the once-only semantics are visible at the call site
- [x] 2.12 Extract a `pollingStrategyLabel` helper and use it everywhere a polling strategy label is derived
- [x] 2.13 Guard both detection intervals with a shared re-entrancy flag so a long detector chain skips a tick instead of interleaving cycles
- [x] 2.14 Reset demotion, missed-change, and poll-cycle state in `cleanup` rather than in `setupAppearanceMonitoring`

## 3. Static verification

- [x] 3.1 `mise run check` passes
- [x] 3.2 `mise run pack-check` passes
- [x] 3.3 `mise run fallow-dead-code` shows no new findings attributable to this change
- [x] 3.4 `openspec validate fix-phantom-color-scheme-subscription --strict` passes

## 4. Host acceptance verification

- [x] 4.1 Inside herdr: appearance tracking recovers within one drift interval and follows host theme flips
- [x] 4.2 Inside herdr: after one grace cycle, Status shows the polling detector as detection strategy, omits the subscription from available detectors, timestamps the fallback in Last Event, and shows the demotion warning exactly once
- [x] 4.3 Inside tmux 3.6+: no regression — Status still reports `Terminal Color Scheme (subscription)` with real-time switching and no demotion warning
- [x] 4.4 Bare terminal: no regression in detection strategy or switching
- [x] 4.5 Session replacement: `/reload` and `/new` raise no uncaught exceptions, `/reload` clears the demotion warning and missed-change state, and the runtime re-probes
- [x] 4.6 Inside tmux 3.6+: flipping appearance twice inside one polling interval leaves the subscription intact and produces no warning
