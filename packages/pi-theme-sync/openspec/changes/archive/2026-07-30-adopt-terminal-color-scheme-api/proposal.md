## Why

`pi-tui@0.79.7` moved terminal color-scheme reporting onto a dedicated
channel: `TUI.handleInput` now calls `consumeTerminalColorSchemeReport`
_before_ extension `inputListeners` run, and that function forwards every
parsed DSR 997 report to `terminalColorSchemeListeners` and returns, so the
data never reaches `ctx.ui.onTerminalInput`. Both of the extension's
terminal-protocol detectors read from that listener, so on Pi 0.79.7 and
later the `dsr-996` polling detector and the `dec-mode-2031` subscription
detector silently stop resolving. What remains is the `osc-11` luminance
heuristic and the `system` detector, which means modern Pi loses
subscription-based updates entirely and falls back to guessing appearance
from a background color.

The same release added the replacement: `queryTerminalColorScheme()`,
`onTerminalColorSchemeChange()`, and `setTerminalColorSchemeNotifications()`
on `TUI`. These write the identical `\x1b[?996n` and `\x1b[?2031h`
sequences the extension writes today, but Pi owns the parsing and the
listener lifecycle. Adopting them restores subscription updates, deletes
roughly half the terminal-protocol code, and stops the extension competing
with Pi's own TUI for the same bytes.

## What Changes

- The extension obtains a `TUI` handle and drives appearance detection
  through Pi's first-class color-scheme API instead of parsing DSR 997 and
  DECRQM replies itself.
- The `dsr-996` polling detector and the `dec-mode-2031` subscription
  detector are replaced by a color-scheme detector pair that is both
  pollable (`queryTerminalColorScheme`) and subscribable
  (`onTerminalColorSchemeChange`). `parseDsr997Reply`, the extension's DSR
  996 query, and its own DSR 997 listener are removed. The DECRQM support
  probe is retained, because `\x1b[?2031;N$y` replies do not match Pi's
  anchored DSR 997 pattern and so still reach extension listeners; it
  continues to gate whether subscription updates are advertised.
- The `osc-11` polling detector and the `system` detector are retained
  unchanged as fallbacks for terminals and multiplexers that do not answer
  DSR 996.
- **BREAKING**: Pi 0.79.7 becomes the supported floor. On older hosts the
  color-scheme detectors report unavailable and detection falls back to
  `osc-11` and `system`, losing subscription updates. Both
  `peerDependencies` entries stay `"*"`, because Pi's package manager
  disables peer resolution and a narrowed range would be inert; the
  boundary is carried by documentation and a runtime warning instead.
  Users on Pi below 0.79.7 should pin `pi-theme-sync@0.3.x`.
- README, CHANGELOG, and the `AGENTS.md` "Detection layering" section are
  updated to describe the two remaining detector classes and the new
  minimum Pi version.

## Capabilities

### New Capabilities

<!-- None. This replaces the implementation of existing detection
     behavior; no new user-facing capability is introduced. -->

### Modified Capabilities

- `theme-sync-detection`: the subscription-preference requirement no longer
  names DEC mode 2031 as the subscription source; the graceful-degradation
  requirement gains a case for a host Pi that does not expose the
  color-scheme API; and a new requirement states that the extension MUST
  source terminal color-scheme reports from that API rather than from raw
  terminal input, so Pi's own consumption of those reports cannot starve
  detection.
- `theme-sync-extension`: the session-replacement guard requirement is
  restated in terms of the color-scheme subscription callback instead of the
  DEC mode 2031 subscription callback.

## Impact

- **Source**: `src/detectors/terminal/dsr-996.ts` is removed and
  `src/detectors/terminal/dec-mode-2031.ts` shrinks to the DECRQM support
  probe; a new `src/detectors/pi/color-scheme.ts` is added along with a
  small TUI-handle accessor. `src/detectors/index.ts` (registry and
  dispatch),
  `src/runtime.ts` (`DETECTOR_LABELS`, subscription setup, cleanup), and
  `src/types.ts` (`PollingDetector`, `SubscriptionDetector`) all change.
  `src/detectors/terminal/query.ts` survives but is consumed only by
  `osc-11`.
- **Dependencies**: `devDependencies` for `@earendil-works/pi-coding-agent`
  and `@earendil-works/pi-tui` move from `^0.74.0` to `^0.79.7` and the
  lockfile is regenerated. `peerDependencies` are deliberately left at
  `"*"`; see design Decision 3.
- **Public API**: no change to configuration schema, config file locations,
  or the `/theme-sync` overlay surface. The `Detection Strategy:` and
  `Available Detectors:` status rows will display different detector names.
- **Release**: minimum-version enforcement makes this a `0.4.0` release
  rather than a patch.
- **Related**: PR #12 adds an OSC 11 subscription for terminal multiplexers.
  That path stays valuable and is out of scope here, because tmux does not
  answer DSR 996 and therefore will not benefit from the color-scheme API.
