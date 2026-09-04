## ADDED Requirements

### Requirement: History browser is sized to the notification being read
The history browser SHALL size itself to whichever of its panes needs the most rows, bounded by a documented share of the terminal height so its own header and footer remain on screen. A notification whose complete message fits within that bound SHALL be shown in full without requiring the user to scroll.

#### Scenario: Selected message fits the available height
- **WHEN** the user opens the browser and the selected notification's complete message needs no more rows than the terminal allows
- **THEN** the browser shows the whole message at once and offers no scrolling affordance

#### Scenario: Few notifications but a long message
- **WHEN** the active branch holds fewer notifications than the detail pane needs rows for the selected message
- **THEN** the browser is sized by the message rather than by the number of notifications

#### Scenario: Selected message exceeds the available height
- **WHEN** the selected notification's complete message needs more rows than the terminal allows
- **THEN** the browser stays within its share of the terminal height and the message remains reachable by scrolling

#### Scenario: Terminal is short
- **WHEN** the terminal is too short for the browser's preferred height
- **THEN** the browser shrinks to fit and keeps its header and footer on screen

### Requirement: Hidden detail content is advertised
When the detail pane shows only part of the selected message, the browser SHALL report the position of the visible portion within the whole message, and SHALL mark each visible edge that has more content beyond it. Both indications SHALL update as the user scrolls, so reaching the start or the end of a message is observable. A message shown in full SHALL carry neither indication.

#### Scenario: Message is longer than the detail pane
- **WHEN** the detail pane shows the start of a message that continues beyond its last visible row
- **THEN** the browser reports the visible position within the whole message and marks the last visible row as having more content below it

#### Scenario: User scrolls into the middle of a message
- **WHEN** the visible portion has content both before and after it
- **THEN** the browser marks the first visible row as having more content above it and the last visible row as having more content below it

#### Scenario: User reaches the end of a message
- **WHEN** the user scrolls to the last row of the message
- **THEN** the reported position shows the end has been reached and no marker claims further content below

#### Scenario: Message is shown in full
- **WHEN** the entire message is visible
- **THEN** the browser reports no position and marks no edge

## MODIFIED Requirements

### Requirement: Captured notifications appear as passive toasts
The extension SHALL display captured notifications in a non-capturing overlay anchored at the top-right of the Pi TUI. Visible toast cards SHALL stack downward without taking keyboard focus from the editor or an active interactive component, and SHALL NOT interfere with any other component's ability to close itself. Cards SHALL be sized to the widest message currently visible, up to the configured maximum width, and all cards in the stack SHALL share one width.

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

### Requirement: Toast presentation is configurable
The extension SHALL load optional global settings from `<agent-dir>/notification-center/config.json` when a session starts. The supported settings SHALL be a top-level `maxToastsVisible` and a `toast` object containing `timeout`, `maxLines`, and `width`, where `width` is the widest a card may be drawn rather than a fixed size. Defaults SHALL be 5 visible toasts, 3000 milliseconds, 5 body rows, and 64 columns.

#### Scenario: No configuration file exists
- **WHEN** notification-center configuration is absent
- **THEN** the extension uses all documented defaults without creating a configuration file or reporting an error

#### Scenario: Valid configuration exists
- **WHEN** the configuration contains valid supported values
- **THEN** each new toast uses the configured timeout, visible limit, body-row limit, and maximum width

#### Scenario: Configuration changes before reload
- **WHEN** the user changes the configuration file and runs Pi's `/reload` command or starts another session
- **THEN** the newly activated extension reads and applies the updated values

#### Scenario: Configuration is malformed or contains invalid values
- **WHEN** configuration cannot be parsed, the `toast` section is not an object, or a supported value is outside its documented valid range
- **THEN** the extension uses the default for each invalid value, remains operational, and records one warning describing the rejected configuration
