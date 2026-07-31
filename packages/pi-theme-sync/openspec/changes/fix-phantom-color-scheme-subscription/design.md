## Context

See proposal.md — Why for motivation.

The state that shapes this design:

- `setupAppearanceMonitoring` in `src/runtime.ts` probes polling and
  subscription detectors, then takes one of two paths. If any subscription
  detector is available it enables the subscription, starts a
  drift-correction `setInterval`, and returns early. Otherwise it starts the
  polling `setInterval`.
- Both intervals use `runtimeConfig.detection.pollIntervalMs` (default
  2000ms, `src/config.ts:38`). The drift corrector is not a lower-frequency
  loop, so "prefer subscription over polling" already means "poll at the
  same rate through a single detector" — the difference between the two
  paths is which detectors get queried, not whether querying happens.
- The drift corrector already computes exactly the signal this change needs:
  its `detectedAppearance !== currentAppearance` branch fires only when a
  re-query saw a transition the subscription did not deliver.
- `warnings` is a closure-level `let` reset per `setupAppearanceMonitoring`
  and returned live by `getStatus`; `src/command.ts` already renders
  `status.warnings`. Runtime-discovered warnings need no new plumbing, and
  `/reload` clears them and re-probes.
- `lastResolvedPollingDetector` already tracks which polling detector
  answered and already feeds `detectionStrategy` on the polling path.

Measured host behavior: herdr 0.7.5 (in Ghostty) answers DECRQM 2031 with
`;2` (recognized, reset), does not answer DSR 996 at all, answers OSC 11
correctly, and emits no unsolicited color-scheme reports. tmux 3.7b answers
both DECRQM and DSR 996 and emits notifications correctly.

## Goals / Non-Goals

**Goals:**

- Recover appearance tracking on hosts that recognize mode 2031 without
  emitting reports, using detectors those hosts do answer.
- Detect the phantom-subscription condition from observed behavior rather
  than from a better capability probe.
- Keep the status surface truthful once the condition is detected.

**Non-Goals:**

- Making the DECRQM probe itself more accurate. No probe can distinguish
  "recognizes" from "will emit"; only observed silence can.
- Eliminating the query traffic that runs alongside a healthy subscription.
  Removing it would drop the Pi-disables-notifications self-heal that the
  drift corrector exists for. Out of scope here.
- Per-host allow/deny lists or host fingerprinting.
- Reworking the drift interval's frequency or making it independently
  configurable.

## Decisions

### Decision 1: Re-query through the polling chain, not the color-scheme detector alone

The drift corrector calls `detectAppearanceViaColorScheme(tui)` (DSR 996).
Replace it with `resolvePollingAppearance(ctx, tui, availablePollingDetectors)`;
both identifiers are already in scope.

Rationale: `color-scheme` is first in `POLLING_DETECTORS`, so on hosts where
DSR 996 works the chain short-circuits on the first detector and the wire
traffic is unchanged. The extra OSC 11 / system queries only occur on hosts
where DSR 996 already times out — precisely the broken case.

Alternative considered: keep the narrow re-query and rely solely on
demotion to start the real poller. Rejected because it makes recovery
strictly slower (one full interval of staleness before the poller starts)
and leaves the drift corrector unable to detect the missed change in the
first place — the missed-change signal *is* a successful polling re-query.

Consequence to handle deliberately: `resolvePollingAppearance` sets
`lastResolvedPollingDetector`, which feeds `detectionStrategy`. Decision 3
resolves what the reported strategy should be.

### Decision 2: Confirm one missed change on the next drift cycle

When the drift re-query observes a new appearance first, apply its mapped
theme immediately and set a flag recording that a change went unreported.
Demote only if that flag is still set when the next drift cycle starts.

The flag records only *that* a change was missed, not *which* appearance it
was, and any subscription report clears it. Liveness is the property being
tested, so a report that disagrees with what polling just saw is equally
good evidence. Matching on a specific appearance would demote a working
subscription whenever appearance changed twice inside one interval, which is
exactly what someone does when manually testing whether theme sync follows
the terminal.

This remains N=1 appearance change. The grace period covers callback
scheduling, not a second theme change. With the default configuration, herdr
is demoted about two seconds after polling first corrects its theme.

The window is the gap between cycles rather than a full `pollIntervalMs`,
because the flag is set after the polling chain resolves in cycle N and read
at the top of cycle N+1. On herdr the unanswered DSR 996 query consumes
300ms of it. That is still several orders of magnitude more than a callback
race needs.

The initial implementation demoted in the same continuation that received
the polling result. Manual tmux 3.7b testing reproduced a false demotion even
though repeated appearance flips were delivered immediately by the
subscription. The grace period covers that measured race without waiting for
another appearance change.

Rejected alternative: demote after N cycles of subscription silence. Silence
is indistinguishable from a user whose theme has not changed, so this would
demote healthy subscriptions.

Rejected alternative: require two missed appearance changes. Appearance
usually changes about twice a day, so confirmation could take more than a
day. One observed change plus one grace cycle provides bounded confirmation
instead.

### Decision 3: Demotion is a visible state change, not a silent fallback

On demotion: drop the subscription detector from `availableDetectors`, let
`detectionStrategy` report the concrete polling detector that answered (via
the existing `lastResolvedPollingDetector`), and push one warning:

```
Terminal color-scheme notifications stopped arriving, so theme sync switched to polling.
```

The warning reports the observation, not a diagnosis. From inside the
extension, a terminal that recognizes mode 2031 without ever emitting reports
and a notification channel that was switched off underneath us produce
identical evidence: silence. Pi's `InteractiveThemeController.setThemeName`
calls `setAutoSync(false)`, which writes `\x1b[?2031l`, so the second case is
reachable on a host whose subscription works perfectly. Wording that blamed
the terminal would send those users chasing a terminal bug that does not
exist.

Continuing to show `Terminal Color Scheme (subscription)` while OSC 11 does
the work would hide the problem entirely and make bug reports harder to
diagnose, so the demotion still has to be visible.

The warning MUST be pushed on the demotion transition only, not evaluated
per cycle, or the array grows without bound and the overlay fills with
duplicates. `demoteColorSchemeSubscription` is guarded by the demotion flag
and performs its check-and-set with no intervening `await`, so overlapping
cycles cannot double-warn.

Demotion also calls `markEvent`, so the Status overlay carries a timestamp
for when the fallback happened rather than leaving the warning undated.

### Decision 4: Demotion keeps the subscription listener teardown minimal

Demotion removes the extension's own listener via the existing cleanup
handle and does not touch the shared terminal notification flag, matching
the existing constraint that Pi's built-in automatic theme controller shares
that state.

Whether to tear down the listener at all is a judgement call: the widened
drift re-query already resolves appearance, so leaving the listener attached
would be harmless and would let a late-waking host resume pushing. Tear it
down anyway, so that `availableDetectors` and actual behavior cannot diverge —
a detector we no longer advertise should not still be able to drive theme
changes.

The extension also does not attempt to repair the channel by re-enabling
notifications before demoting, even though that would recover the
Pi-disabled-it case. Two reasons. The flag is shared host state, and the
archived `adopt-terminal-color-scheme-api` design records that Pi's theme
controller caches its own enabled state, so writing the flag from here can
desync that cache in the other direction. More practically, re-enabling
produces no testable signal: notifications only fire on the next appearance
change, which may be hours away, so it cannot inform the current decision.
The honest resolution is the Decision 3 wording, which does not claim the
terminal is at fault, plus polling that keeps working either way.

## Risks / Trade-offs

- **A future host emits notifications only after a delay, and we demote it
  before its first report** → Cost is bounded and self-evident: appearance
  stays correct via polling, and the warning names the condition so the
  behavior is diagnosable rather than mysterious. `/reload` re-probes.
- **Demotion is session-sticky with no re-promotion path** → Accepted. A
  host that fails to report a change has demonstrated a static capability
  gap, not a transient fault; re-promotion would need its own liveness
  tracking for no user-visible gain. `/reload` is the escape hatch.
- **Extra terminal queries per cycle on hosts where the first polling
  detector fails** → Bounded by the detector count (3) and only on hosts
  that already time out on DSR 996. The OSC 11 and system detectors were
  already being queried every cycle on the polling path.
- **A chain of three detectors can outlast a short `pollIntervalMs`** →
  `pollIntervalMs` allows values as low as 1000ms, while a fully timing-out
  chain costs 300ms for `color-scheme`, 300ms for `osc-11`, and an unbounded
  `execFile` for `system`. Both intervals therefore share an
  `isPollCycleRunning` guard and skip a tick rather than letting two cycles
  interleave writes to `currentAppearance`. The guard is reset in `cleanup`
  so a session replacement cannot strand it.
- **`detectionStrategy` becomes non-constant across a session** → It already
  was: the subscription callback assigns it, and the polling path derives it
  from whichever detector answered. Status is documented as effective
  runtime state, so a strategy that changes when behavior changes is correct.

## Migration Plan

No config migration, no data migration, no dependency change. Behavior
change is confined to sessions where a subscription is advertised: hosts
that emit notifications are unaffected, hosts that do not gain polling-based
tracking plus a warning. Rollback is reverting the commit.

Acceptance verification is host-dependent and cannot be covered by static
checks alone — it requires the herdr, tmux, and bare-terminal runs
enumerated in tasks.md.
