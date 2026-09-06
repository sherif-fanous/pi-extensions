## ADDED Requirements

### Requirement: History browser fits the width it is given
The history browser SHALL NOT draw any row wider than the width available to it. When the terminal is too narrow to show two legible panes, the extension SHALL omit the browser rather than draw a cut-off frame, and `/notifications` SHALL instead report how many notifications the active branch holds as a plain notification. The browser SHALL remain usable at every width that can hold two legible panes, shrinking both panes toward their minimum rather than overflowing.

#### Scenario: Terminal is narrower than the browser needs
- **WHEN** the user runs `/notifications` on a terminal too narrow for two legible panes
- **THEN** no browser opens and the extension reports how many notifications the active branch holds as a plain notification

#### Scenario: Terminal is too narrow and no notification has been captured
- **WHEN** the user runs `/notifications` on a terminal too narrow for two legible panes and no notification has been captured in the active session
- **THEN** no browser opens and the extension reports the same empty-state message as a plain notification

#### Scenario: Terminal is narrow but wide enough
- **WHEN** the terminal is narrower than the browser's preferred width but still wide enough for two legible panes
- **THEN** the browser is drawn inside the terminal width with both panes narrowed, and no row extends past the terminal's last column

#### Scenario: Terminal becomes too narrow while the browser is open
- **WHEN** the user narrows the terminal below two legible panes while the browser is open
- **THEN** the browser draws nothing rather than a cut-off frame, reappears when the terminal is widened again, and still closes on the configured cancel action

## MODIFIED Requirements

### Requirement: Captured notifications appear as passive toasts
The extension SHALL display captured notifications in a non-capturing overlay anchored at the top-right of the Pi TUI. Visible toast cards SHALL stack downward without taking keyboard focus from the editor or an active interactive component, and SHALL NOT interfere with any other component's ability to close itself. Cards SHALL be sized to the widest message currently visible, up to the configured maximum width, and all cards in the stack SHALL share one width. Cards SHALL stay in the top-right corner at every card width.

#### Scenario: Notification arrives while the user is typing
- **WHEN** a captured notification arrives while the editor or another component owns keyboard focus
- **THEN** the toast appears without changing the focused component or consuming subsequent keyboard input

#### Scenario: Notification arrives while an interactive component is open
- **WHEN** a captured notification arrives while an overlay, selector, or dialog owns keyboard focus
- **THEN** that component retains focus, remains able to receive input, and remains able to close itself through its own cancel action

#### Scenario: Several notifications arrive before earlier ones expire
- **WHEN** multiple captured notifications are simultaneously active
- **THEN** the overlay displays each one as its own card in one downward-growing stack in arrival order, subject to the configured visible limit

#### Scenario: Visible limit is exceeded
- **WHEN** a new toast would exceed the configured maximum number of visible toasts
- **THEN** the oldest visible toast leaves the stack while its complete notification remains available in history

#### Scenario: Message is shorter than the configured width
- **WHEN** every visible notification is narrower than the configured maximum width
- **THEN** the cards are drawn only as wide as the widest visible message, subject to a minimum width that keeps the framing legible

#### Scenario: Cards are narrower than the configured width
- **WHEN** the visible cards are drawn narrower than the configured maximum width
- **THEN** they stay in the top-right corner rather than moving toward the middle of the terminal

#### Scenario: Messages of differing lengths are visible together
- **WHEN** the visible stack holds messages of differing widths
- **THEN** every card is drawn at the same width so the stack keeps a straight edge

#### Scenario: Message does not fit one toast row
- **WHEN** a notification contains multiple lines or is wider than the card
- **THEN** the toast wraps the message across up to the configured maximum number of body rows, preserving the message's own line breaks, and history retains the complete original message

#### Scenario: Message exceeds the configured toast height
- **WHEN** a notification needs more body rows than the configured maximum
- **THEN** the toast shows the first rows up to that maximum, marks the final row as truncated, and history retains the complete original message

#### Scenario: Terminal is narrower than the configured width
- **WHEN** the terminal is narrower than the configured maximum width but still wide enough for a legible card
- **THEN** the cards shrink to fit the terminal rather than being omitted

#### Scenario: Terminal cannot safely show the overlay
- **WHEN** the terminal is too short, or too narrow for even the narrowest legible card
- **THEN** the notification center omits the visible toast without failing and still records the notification in history

#### Scenario: Stack is taller than the space available
- **WHEN** the visible cards together need more rows than the toast surface may occupy
- **THEN** the overlay shows only the cards that fit, keeping the newest, and history retains every notification
