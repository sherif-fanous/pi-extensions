## Context

See proposal.md - Why. Two surfaces size themselves today, and both derive their size from something other than the message being displayed.

The history browser computes its content rows from the number of captured notifications, clamped between a fixed floor and ceiling and capped by the terminal. The detail pane is formatted after that decision, so it can never influence it. The toast stack computes card width from the configured setting, clamped by the granted viewport width, so it is constant regardless of message length. A guard hides the toast surface when the terminal is narrower than the configured width plus a margin.

Constraints that shape the approach:

- Terminal layout is measured in visual columns, never string length, because ANSI escapes and wide characters break the framing.
- Pure formatting is separated from rendering: an exported function returns lines, and a thin component routes them, so tests never stub the TUI.
- Presentation is omitted entirely rather than degraded when the terminal is too small.
- The toast surface is created once at session start and toggled, never re-pushed, so anything the surface is constructed with is fixed for the session while the terminal can change under it.

## Goals / Non-Goals

**Goals:**

- Derive each surface's size from the content it is showing, bounded by the terminal.
- Make hidden content and scroll position observable in the history browser.
- Keep both surfaces' sizing decisions in pure functions that tests can assert on directly.

**Non-Goals:**

- Per-card toast widths. The stack shares one width so its right edge stays straight.
- Configurable proportions for either surface's terminal bound. The share of the terminal is a constant.
- Percentage-valued configuration. Every setting stays a plain number.
- Changing what is captured, stored, or how long toasts live.

## Decisions

**Size the browser from the taller pane, not the list.** The two panes are drawn to the same row count so the divider stays straight, so the row count must satisfy whichever pane needs more. This requires formatting the detail before choosing the height, which is safe because pane widths do not depend on the height. The alternative, keeping the list-derived height and relying on scrolling, is what produced the problem: one notification with a long message opened at the floor height while the terminal sat empty.

**Bound the browser by a share of the terminal, not a fixed ceiling.** A fixed maximum row count forces scrolling on a tall terminal for no reason, and a bound of the full terminal would collide with the surrounding UI. One constant expresses the share, and the same constant sets the requested overlay ceiling, so the component cannot draw rows the overlay would clip. When no terminal height is available there is nothing to fit to, so a fixed fallback applies.

**Report position in the pane's own header, and mark the edges.** The footer already carries a scrolling hint, but it sits under the other pane, is binary, and cannot say whether the end has been reached. The header belongs to the pane it describes and already carries the list pane's position, so the two panes stay consistent. Edge markers answer the question at the point of truncation, which the header alone cannot: a cut that lands after a sentence looks like the end of the message. Both are needed, and both are pure formatting.

**Mark both edges, not just the trailing one.** Marking only the bottom leaves the same ambiguity at the top as soon as the user scrolls. A pane showing a single row is both the first and last visible row, so it carries a combined marker rather than an arbitrary one of the two.

**Treat the configured toast width as a maximum.** Sizing to the widest visible message keeps a short notice small instead of drawing a wide, mostly empty card over the transcript, and lets the setting be raised to help long messages without penalizing short ones. Natural width is measured per line so a multiline message is sized by its longest line. The whole stack shares one width, computed from the candidate cards, because right-anchored cards of differing widths look ragged.

**Bound the card by the terminal as well as by the granted viewport.** The toast surface is created once with the configured width, so a later resize can leave that width wider than the terminal. Previously the narrowness guard made this unreachable; with the guard relaxed it is not, so the terminal width is bounded explicitly at render time.

**Base the terminal-fit guard on the narrowest legible card.** With cards shrinking to fit, a guard keyed to the configured width would hide the surface on terminals that can host a perfectly readable narrow card, and raising the default width would silently blank toasts on more terminals than before. The guard keeps its purpose, refusing to draw broken framing, but is expressed in terms of the minimum card. This makes the guard independent of configuration, which also simplifies its use as the surface's visibility predicate.

**Raise the default width rather than the default height.** Rows come out of the visible transcript and are the more expensive dimension, while the width bound now only affects messages long enough to reach it. The two changes depend on each other: raising the default without content-fit sizing would make every short notification wider.

## Risks / Trade-offs

- A short notification shown alongside a long one is stretched to the shared width → accepted deliberately for a straight stack edge; per-card widths remain possible later without changing the requirement.
- Relaxing the terminal-fit guard changes behavior on narrow terminals, from no toasts to narrow toasts → this is the documented intent of the requirement change, and the guard still refuses terminals too small for legible framing.
- Raising a documented default changes what existing users see without their configuration changing → the setting still honors any explicit value, and the change is recorded for users in the changelog.
- Card width now depends on message content, so a stack's width changes as cards arrive and expire → bounded by the configured maximum, and the alternative of a constant width is what this change removes.
- Formatting the detail pane before choosing the browser height does slightly more work on each render → the pane is already reformatted on every render by design, since nothing is cached, so this adds no new class of work.

## Migration Plan

No data or configuration migration. Existing configuration files stay valid, and the width setting keeps its name and range while becoming a maximum. Users who prefer the previous fixed appearance can set `toast.width` to the old default, which caps cards where they used to sit.
