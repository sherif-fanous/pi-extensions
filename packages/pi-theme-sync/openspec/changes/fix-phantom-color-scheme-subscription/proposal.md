## Why

Some hosts answer the DEC mode 2031 DECRQM probe with "mode recognized"
but never emit color-scheme notifications. On those hosts (measured:
herdr 0.7.5 inside Ghostty) v0.4.0+ advertises the subscription detector,
enables it, skips the poller, and then silently stops tracking appearance
for the rest of the session — while a working OSC 11 fallback sits unused.

DECRQM reports that a host *recognizes* a mode; it does not promise the
host will *emit* reports for it. The current design conflates the two, and
the existing drift-correction self-heal cannot recover because it re-queries
through the same channel the host does not answer.

## What Changes

- The drift-correction pass that runs alongside an active subscription
  re-queries through the full polling detector chain instead of only the
  color-scheme detector, so hosts that answer OSC 11 but not DSR 996
  keep tracking appearance.
- A subscription that misses an appearance change is demoted once the next
  polling cycle confirms the miss. Polling still corrects the theme
  immediately, and any subscription report during the grace window prevents
  a false demotion.
- Demotion is surfaced rather than hidden. The status overlay reports the
  polling detector that answered, timestamps the fallback, and warns that
  color-scheme notifications stopped arriving. The warning describes the
  observation instead of blaming the terminal, because a notification
  channel disabled by other software looks identical from here.
- Both detection intervals gain a re-entrancy guard so a detector chain that
  outlasts a short polling interval skips a tick instead of interleaving
  two cycles.

## Capabilities

### New Capabilities

<!-- None. This change constrains existing detection behavior. -->

### Modified Capabilities

- `theme-sync-detection`: subscription preference becomes conditional on the
  subscription proving functional. Adds requirements for widening the
  drift-correction re-query to the polling chain, for demoting a
  non-functional subscription after one missed appearance change survives a
  polling-interval grace period, and for reporting the demotion through
  detection strategy, available detectors, and a warning.

## Impact

- `src/runtime.ts` — the drift-correction interval inside
  `setupAppearanceMonitoring`: re-query via `resolvePollingAppearance`,
  missed-change detection, subscription demotion, `detectionStrategy` /
  `availableDetectors` / `warnings` / `lastEvent` updates. The plain polling
  interval gains the same re-entrancy guard.
- `openspec/specs/theme-sync-detection/spec.md` — via delta.
- No config schema change, no new dependency, no public API change.
- Affected hosts: any terminal or multiplexer that recognizes mode 2031
  without emitting `\x1b[?997;Nn`. Hosts that emit correctly (measured:
  tmux 3.7b) must keep real-time subscription behavior unchanged.
