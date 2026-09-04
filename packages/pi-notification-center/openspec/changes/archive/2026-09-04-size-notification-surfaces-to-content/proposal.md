## Why

Both notification surfaces are sized by configuration and by list length rather than by the notification the user is trying to read, so a message is cut short while the terminal around it sits empty. The history browser is the complete record, but it opens at a height derived from the number of captured notifications, so a single long notification is squeezed into a fixed frame and has to be paged through. The toast card is drawn at its configured width whatever the message, so a short notice covers the transcript with an empty box while a long one truncates early. Neither surface tells the user what it is holding back.

## What Changes

- Size the history browser to whichever of its two panes needs the most rows, bounded by a share of the terminal height, so a message that can fit is shown whole.
- Show the detail pane's scroll position in its own header, and mark the visible rows that have more content above or below them, so a truncated message is never mistaken for a complete one.
- Treat the configured toast width as a maximum rather than a fixed size, and size cards to the widest message currently on show, with one width for the whole stack.
- Decide whether a terminal can host toasts from the narrowest legible card rather than from the configured width, so a terminal narrower than that setting shows narrow cards instead of nothing.
- Widen the default toast card, which is now a ceiling and so only affects messages long enough to need it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notification-center`: The history browser gains height and scroll-affordance requirements; the toast surface's width requirement becomes a maximum, and its terminal-fit guard is restated in terms of the minimum card rather than the configured width.

## Impact

- Affects the toast presentation, the history browser, and their shared formatting helpers.
- Changes a documented configuration default and the meaning of the width setting from a fixed size to a limit, which changes how existing configuration files render without making them invalid.
- Terminals narrower than the configured toast width now show toasts where they previously showed none.
- No change to capture, persistence, history contents, timers, focus behavior, or the overlay stack.
