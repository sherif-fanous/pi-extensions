## 1. History browser height

- [x] 1.1 Derive the browser's content rows from whichever pane needs more, formatting the detail before the height is chosen, and verify a test asserting a single long notification is shown in full on a tall terminal
- [x] 1.2 Bound the height by a named share of the terminal, keeping a fixed fallback when no terminal height is available, and verify the existing short-terminal test still shows the footer within the terminal
- [x] 1.3 Request the overlay's maximum height from the same constant the component bounds itself by, and verify type checking passes with the size value the TUI accepts

## 2. Detail scroll affordances

- [x] 2.1 Add a pure function returning the detail pane's title with its visible range, bare when the whole message fits, and verify unit tests covering the fits, mid-scroll, and at-the-end cases
- [x] 2.2 Add a pure function marking the first and last visible rows when content lies beyond them, including the combined marker for a single-row pane, and verify unit tests covering each edge combination, the pane width being preserved on a full row, and the marker being the only styled span
- [x] 2.3 Route both through the browser's render, driven by the current scroll offset, and verify a test that pages through a long message and asserts the title range and edge markers at the top, the middle, and the end
- [x] 2.4 Verify a notification that fits shows neither a range nor any marker

## 3. Toast card width

- [x] 3.1 Add a pure measurement of the width the widest visible message would need, measured per line in visual columns, and verify unit tests for single-line, multiline, and empty inputs
- [x] 3.2 Size cards to that measurement, bounded by the configured maximum, the granted viewport, and the terminal, and floored at the minimum legible width, and verify unit tests for a short message, a message past the maximum, a message below the minimum, and a terminal narrower than the configured maximum
- [x] 3.3 Verify a test that a stack of differing message lengths renders every card at one width

## 4. Terminal-fit guard

- [x] 4.1 Express the guard in terms of the narrowest legible card rather than the configured width, dropping its configuration parameter, and verify unit tests for the narrow and short boundaries
- [x] 4.2 Update the toast surface's visibility predicate to the new signature and verify the toast manager tests pass unchanged

## 5. Default and documentation

- [x] 5.1 Raise the default toast width and verify the configuration defaults test asserts the new value
- [x] 5.2 Update the README configuration sample, the defaults table, and the description of the width setting as a maximum, and verify the documented default matches the code
- [x] 5.3 Record the user-facing changes in the changelog and verify the format check passes

## 6. Manual verification

- [x] 6.1 Extend the development emitter so burst, multiline, and long-message samples take a count, and verify each subcommand produces the requested size
- [x] 6.2 Drive both surfaces manually with the emitter and verify a short notification yields a small card, a long one fills the configured maximum, a narrow terminal still shows toasts, and the browser shows a fitting message in full while a longer one scrolls with its range and edge markers
