## Why

The history browser draws itself wider than the terminal it was handed. Below 39 columns it keeps its own minimum width and never bounds the result, so Pi slices the overflow and the user sees a frame with its right border and part of its divider missing. The project rule is the opposite: truncate to the viewport as the last step, and omit presentation rather than degrade it.

The specification cannot catch this. It says what the browser does when the terminal is too short, and it says what the toast surface does when the terminal is too short or too narrow. It says nothing about a browser on a narrow terminal. The same silence hid an earlier defect: placement appears only in requirement prose while three scenarios cover sizing, so short toasts drifted 44 columns from the corner and no scenario disagreed.

Both surfaces answer the same question, and only one of them answers it. This change settles it for both and writes the answers down.

## What Changes

- The history browser omits itself when the terminal is too narrow for two legible panes. The `/notifications` command then reports the notification count as a plain notification, which is the fallback it already uses outside the interactive TUI.ƒ
- The browser truncates its own output to the width it was given, as its final step, so nothing can overflow again.
- `renderSplitFrame` takes the total width and derives the pane widths from it. Today it takes pane widths and derives the total, which forces the browser to reverse the frame's own arithmetic in three places and makes fitting a viewport impossible to guarantee.
- The browser's layout derivation moves into a pure function that returns rows. The component keeps the selection, the scroll offset, and the key handling. This follows the rule the toast surface already follows, and it fixes a page-scroll size that is only correct after the first render.
- The toast horizontal margin is stated once. The stack reserves two columns while the surface asks Pi for one.
- Toast placement gains a scenario, so the corner the cards are drawn in is a documented behavior rather than a sentence in a requirement.

No configuration setting changes. No user-visible behavior changes on a terminal wide enough to draw the browser, which is every terminal at or above 39 columns.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notification-center`: two requirements gain scenarios for geometry that is currently undocumented. The history browser gets the narrow-terminal case it lacks, matching the toast surface, which already has it. The toast surface gets a placement scenario for the corner it is drawn in.

## Impact

Source, all internal:

- `src/ui/frame.ts` inverts the width contract of `renderSplitFrame` and exposes the frame's own chrome, which the browser currently re-derives.
- `src/ui/history-view.ts` loses its layout arithmetic to a new pure function and gains a too-narrow answer.
- `src/commands/notifications.ts` handles the omitted overlay.
- `src/ui/toast-stack.ts` and `src/ui/toast-manager.ts` share one margin.

Tests:

- `tests/frame.test.ts` pins the arithmetic this change inverts: the total width is `left.width + right.width + 7`, and the output is `rows + 6` lines. Those assertions are expected to fail and must be rewritten against the new contract, not worked around.
- `tests/history-view.test.ts` currently asserts that a 20-column render returns lines wider than 20, which pins the defect as correct. It also recovers pane content by splitting rendered lines on the divider character, which breaks on any message containing that character. Both change with the new pure function.

Verification needs a live terminal. Neither defect is visible to the automated suite as it stands, because tests read returned strings and never model the column those strings are drawn at.

Two items deferred from earlier work land here, because both are geometry and splitting them would move the same code twice: the browser's hardcoded card chrome, and the toast margin above.
