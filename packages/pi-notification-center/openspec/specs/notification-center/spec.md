## Purpose

Provide a quiet, session-aware notification experience for Pi extensions by replacing eligible transcript notices with temporary terminal toasts and retaining a dated history for later review.

## Requirements

### Requirement: Eligible extension notifications are captured
The extension SHALL capture notifications sent through the shared Pi extension `ctx.ui.notify` API after the notification center activates in an interactive TUI session. It SHALL preserve the original message and map Pi's `info`, `warning`, and `error` notification types to the same severities in its own records.

#### Scenario: Extension emits a notification after activation
- **WHEN** an extension sends an `info`, `warning`, or `error` notification through the shared extension UI context after notification-center activation
- **THEN** the notification center records the message and severity and prevents that call from adding its normal notification line to the chat transcript

#### Scenario: Notification has no explicit type
- **WHEN** an extension sends a notification without a type
- **THEN** the notification center records and displays it as `info`

#### Scenario: Notification occurs outside interactive TUI mode
- **WHEN** Pi runs in RPC, JSON, or print mode
- **THEN** the notification center SHALL leave the existing notification behavior unchanged and SHALL NOT attempt terminal overlay rendering

### Requirement: Capture scope remains explicit
The extension SHALL limit interception to notifications that pass through the shared extension UI notification function available after activation. It SHALL NOT claim to capture Pi core status, warning, or error messages, notifications emitted before activation, project-trust notifications, or notifications sent through separately created UI contexts that bypass the wrapped function.

#### Scenario: Pi emits an internal status message
- **WHEN** Pi renders a core status, warning, or error without calling the wrapped extension notification function
- **THEN** Pi renders that message normally and the notification center does not add it to history

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

### Requirement: Toasts expire independently
Each visible toast SHALL leave the stack after the configured timeout measured from its arrival. Removing one toast SHALL compact the remaining stack without closing unrelated overlays.

#### Scenario: One toast expires while newer toasts remain
- **WHEN** the oldest toast reaches its timeout before newer toasts
- **THEN** only that toast disappears and the remaining cards move up to close the gap

#### Scenario: New notification arrives during an existing timeout
- **WHEN** a notification arrives while another toast timer is active
- **THEN** both notifications retain independent expiration times

### Requirement: Session notification history is retained
The extension SHALL store every captured notification as Pi session data containing the complete message, severity, and capture timestamp. It SHALL rebuild history from the active session branch after session start or reload and SHALL NOT maintain cross-session global history.

#### Scenario: Session is reloaded or resumed
- **WHEN** Pi reloads the extension or resumes a persisted session
- **THEN** notifications stored on the active session branch remain available through `/notifications`

#### Scenario: Session branch changes
- **WHEN** the user resumes or navigates to a branch with a different set of stored notification entries
- **THEN** the history reflects the notification entries on that active branch

#### Scenario: New session starts
- **WHEN** the user starts a new Pi session
- **THEN** its notification history begins independently of previous sessions

### Requirement: Notification history is browsable
The extension SHALL register `/notifications` as an interactive command. The command SHALL open a two-pane browser: a list pane naming every notification on the active branch newest first, and a detail pane showing the selected notification's local date and time, severity, and complete message. Severities SHALL be visually distinguished by color, and the command SHALL close on Pi's configured cancel input.

#### Scenario: User opens populated history
- **WHEN** the user runs `/notifications` after notifications have been captured
- **THEN** the list pane shows every notification on the active branch newest first with its time, severity, and a single-line preview, and the detail pane shows the newest notification in full

#### Scenario: User moves through the list
- **WHEN** the user moves the selection in the list pane
- **THEN** the highlighted row changes and the detail pane shows the newly selected notification

#### Scenario: Severities are distinguishable
- **WHEN** the browser displays notifications of differing severity
- **THEN** each severity is rendered in its own theme color in both panes

#### Scenario: Selected message is longer than the detail pane
- **WHEN** the selected notification's message needs more rows than the detail pane shows
- **THEN** the user can scroll the detail pane to read the complete message

#### Scenario: User opens empty history
- **WHEN** the user runs `/notifications` before any notification has been captured in the active session
- **THEN** the command shows a clear empty-state message

#### Scenario: User closes history
- **WHEN** the history browser is open and the user invokes the configured cancel action
- **THEN** the browser closes and keyboard focus returns to the prior component

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

### Requirement: Runtime cleanup is safe
The extension SHALL cancel its timers, remove its toast surface, and stop using stale session UI state when the session shuts down or extensions reload.

#### Scenario: Reload occurs while toasts are visible
- **WHEN** Pi reloads or replaces the session while toast timers are active
- **THEN** the old runtime removes its surface and timers without later changing the new runtime's UI

### Requirement: Package follows Pi installation conventions
The repository SHALL expose the extension through the `pi.extensions` package manifest and SHALL support installation through Pi's npm package mechanism. It SHALL use only terminal UI output and SHALL NOT issue operating-system notifications.

#### Scenario: Package is installed through Pi
- **WHEN** a user installs the published npm package with `pi install npm:@sherif-fanous/pi-notification-center`
- **THEN** Pi discovers and loads the extension entry point declared by the package

#### Scenario: Captured notification is displayed
- **WHEN** the notification center presents a captured notification
- **THEN** all visible output remains inside Pi's terminal UI and no operating-system notification is sent
