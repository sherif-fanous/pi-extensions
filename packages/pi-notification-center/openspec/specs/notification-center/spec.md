## Purpose

Provide a quiet, session-aware notification experience for Pi extensions by
replacing eligible transcript notices with temporary terminal toasts and
retaining a dated history for later review.

## Requirements

### Requirement: Eligible extension notifications are captured

The extension SHALL capture notifications sent through the shared Pi extension
`ctx.ui.notify` API after the notification center activates in an interactive
TUI session. It SHALL preserve the original message and map Pi's `info`,
`warning`, and `error` notification types to the same severities in its own
records.

#### Scenario: Extension emits a notification after activation

- **WHEN** an extension sends an `info`, `warning`, or `error` notification
  through the shared extension UI context after notification-center activation
- **THEN** the notification center records the message and severity and prevents
  that call from adding its normal notification line to the chat transcript

#### Scenario: Notification has no explicit type

- **WHEN** an extension sends a notification without a type
- **THEN** the notification center records and displays it as `info`

#### Scenario: Notification occurs outside interactive TUI mode

- **WHEN** Pi runs in RPC, JSON, or print mode
- **THEN** the notification center SHALL leave the existing notification
  behavior unchanged and SHALL NOT attempt terminal overlay rendering

### Requirement: Capture scope remains explicit

The extension SHALL limit interception to notifications that pass through the
shared extension UI notification function available after activation. It SHALL
NOT claim to capture Pi core status, warning, or error messages, notifications
emitted before activation, project-trust notifications, or notifications sent
through separately created UI contexts that bypass the wrapped function.

#### Scenario: Pi emits an internal status message

- **WHEN** Pi renders a core status, warning, or error without calling the
  wrapped extension notification function
- **THEN** Pi renders that message normally and the notification center does not
  add it to history

### Requirement: Captured notifications appear as passive toasts

The extension SHALL display captured notifications in a non-capturing overlay
anchored at the top-right of the Pi TUI. Visible toast cards SHALL stack
downward without taking keyboard focus from the editor or an active interactive
component, and SHALL NOT interfere with any other component's ability to close
itself. Cards SHALL be sized to the widest message currently visible, up to the
configured maximum width, and all cards in the stack SHALL share one width.
Cards SHALL stay in the top-right corner at every card width.

#### Scenario: Notification arrives while the user is typing

- **WHEN** a captured notification arrives while the editor or another component
  owns keyboard focus
- **THEN** the toast appears without changing the focused component or consuming
  subsequent keyboard input

#### Scenario: Notification arrives while an interactive component is open

- **WHEN** a captured notification arrives while an overlay, selector, or dialog
  owns keyboard focus
- **THEN** that component retains focus, remains able to receive input, and
  remains able to close itself through its own cancel action

#### Scenario: Several notifications arrive before earlier ones expire

- **WHEN** multiple captured notifications are simultaneously active
- **THEN** the overlay displays each one as its own card in one downward-growing
  stack in arrival order, subject to the configured visible limit

#### Scenario: Visible limit is exceeded

- **WHEN** a new toast would exceed the configured maximum number of visible
  toasts
- **THEN** the oldest visible toast leaves the stack while its complete
  notification remains available in history

#### Scenario: Message is shorter than the configured width

- **WHEN** every visible notification is narrower than the configured maximum
  width
- **THEN** the cards are drawn only as wide as the widest visible message,
  subject to a minimum width that keeps the framing legible

#### Scenario: Cards are narrower than the configured width

- **WHEN** the visible cards are drawn narrower than the configured maximum
  width
- **THEN** they stay in the top-right corner rather than moving toward the
  middle of the terminal

#### Scenario: Messages of differing lengths are visible together

- **WHEN** the visible stack holds messages of differing widths
- **THEN** every card is drawn at the same width so the stack keeps a straight
  edge

#### Scenario: Message does not fit one toast row

- **WHEN** a notification contains multiple lines or is wider than the card
- **THEN** the toast wraps the message across up to the configured maximum
  number of body rows, preserving the message's own line breaks, and history
  retains the complete original message

#### Scenario: Message exceeds the configured toast height

- **WHEN** a notification needs more body rows than the configured maximum
- **THEN** the toast shows the first rows up to that maximum, marks the final
  row as truncated, and history retains the complete original message

#### Scenario: Terminal is narrower than the configured width

- **WHEN** the terminal is narrower than the configured maximum width but still
  wide enough for a legible card
- **THEN** the cards shrink to fit the terminal rather than being omitted

#### Scenario: Terminal cannot safely show the overlay

- **WHEN** the terminal is too short, or too narrow for even the narrowest
  legible card
- **THEN** the notification center omits the visible toast without failing and
  still records the notification in history

#### Scenario: Stack is taller than the space available

- **WHEN** the visible cards together need more rows than the toast surface may
  occupy
- **THEN** the overlay shows only the cards that fit, keeping the newest, and
  history retains every notification

### Requirement: Toast presentation is configurable

The extension SHALL load optional User settings from
`<agent-dir>/notification-center/config.json` when a session starts. It SHALL
have no Project scope, so it SHALL NOT read a project file or consult Pi's
project trust. The supported settings SHALL be a top-level integer `version`
and a `toast` object containing `maxVisible`, `timeoutMs`, `maxLines`, and
`width`, where `width` is the widest a card may be drawn rather than a fixed
size. Defaults SHALL be 5 visible toasts, 3000 milliseconds, 5 body rows, and
64 columns. The file's version SHALL be 2.

#### Scenario: No configuration file exists

- **WHEN** notification-center configuration is absent
- **THEN** the extension uses all documented defaults without creating a
  configuration file or reporting an error

#### Scenario: Valid configuration exists

- **WHEN** the configuration contains valid supported values
- **THEN** each new toast uses the configured timeout, visible limit, body-row
  limit, and maximum width

#### Scenario: Configuration has no version

- **WHEN** the configuration file has no `version` key
- **THEN** the extension reads it as version 2 without a warning

#### Scenario: Configuration has an unsupported version

- **WHEN** the configuration file's `version` is anything other than 2
- **THEN** the extension ignores the file, uses the defaults, warns
  `Configuration at <path> has version <v>, but only version 2 is supported. Ignored the file.`,
  and never rewrites the file

#### Scenario: A project configuration file exists

- **WHEN** the directory Pi starts in holds `.pi/notification-center/config.json`
- **THEN** the extension ignores it and never asks whether the project is
  trusted

#### Scenario: Configuration changes before reload

- **WHEN** the user changes the configuration file and runs Pi's `/reload`
  command or starts another session
- **THEN** the newly activated extension reads and applies the updated values

#### Scenario: Configuration is malformed or contains invalid values

- **WHEN** configuration cannot be parsed, the `toast` section is not an object,
  or a supported value is outside its documented valid range
- **THEN** the extension uses the default for each invalid value, remains
  operational, and records one warning notification, headed
  `Notification Center: 1 warning` or `Notification Center: <n> warnings`, that
  lists every rejected value

### Requirement: Renamed settings migrate at session start

The extension SHALL read `maxToastsVisible` as `toast.maxVisible` and
`toast.timeout` as `toast.timeoutMs` while the new key is absent. When a
session starts and the User file uses either old key, the extension SHALL
rewrite the file atomically with the new keys and `"version": 2`, keeping every
other key, and SHALL show one info notification
`Notification Center migrated its configuration to <path>.`

#### Scenario: File uses the old key names

- **WHEN** a session starts and the User file sets `maxToastsVisible` or
  `toast.timeout`
- **THEN** the session uses those values, the file is rewritten with
  `toast.maxVisible` and `toast.timeoutMs` and `"version": 2`, and one info
  notification names the file

#### Scenario: File sets both an old and a new key name

- **WHEN** the User file sets both `toast.timeout` and `toast.timeoutMs`
- **THEN** the value of `toast.timeoutMs` applies and the migration drops
  `toast.timeout`

#### Scenario: The migration cannot write the file

- **WHEN** rewriting the User file fails
- **THEN** the file stays unchanged, the session still uses the old keys'
  values, and the session's warning notification lists
  `Could not migrate configuration at <path>: <message>. Left the file unchanged.`
  before any invalid values

#### Scenario: File has an unsupported version

- **WHEN** the User file uses an old key name but has a `version` other than 2
- **THEN** the extension neither reads nor rewrites the file

### Requirement: Status reports the configuration in use

The extension SHALL offer `/notifications status`, completed with the
description `Show Notification Center status`. It SHALL show a report headed
`Notification Center Status` with whether toasts are on in this session, how
many notifications the active branch holds, and the toast settings the session
uses, then a blank line and a `Config:` block naming the User file's path and
its state: `loaded`, `not found`, or `invalid: <reason>`. Warnings about
invalid values and a failed migration SHALL follow under `Warnings:`; file
problems SHALL show only in the `Config:` block. In the interactive TUI the
report SHALL be a transcript entry; in other modes it SHALL be a notification.

#### Scenario: User asks for status in the TUI

- **WHEN** the user runs `/notifications status` in the interactive TUI
- **THEN** a `Notification Center Status` transcript entry shows `Toasts: on`,
  the captured count, the toast settings, and the `Config:` block

#### Scenario: User asks for status outside the TUI

- **WHEN** the user runs `/notifications status` in RPC, JSON, or print mode
- **THEN** the same report arrives as an info notification with `Toasts: off`

#### Scenario: The configuration file changed after the session started

- **WHEN** the user edits the file and runs `/notifications status` without
  reloading
- **THEN** the report shows the settings the session started with

### Requirement: Toasts expire independently

Each visible toast SHALL leave the stack after the configured timeout measured
from its arrival. Removing one toast SHALL compact the remaining stack without
closing unrelated overlays.

#### Scenario: One toast expires while newer toasts remain

- **WHEN** the oldest toast reaches its timeout before newer toasts
- **THEN** only that toast disappears and the remaining cards move up to close
  the gap

#### Scenario: New notification arrives during an existing timeout

- **WHEN** a notification arrives while another toast timer is active
- **THEN** both notifications retain independent expiration times

### Requirement: Session notification history is retained

The extension SHALL store every captured notification as Pi session data
containing the complete message, severity, capture timestamp, and `version` 1.
It SHALL read a stored payload without a `version` as version 1 and skip one
with any other version. It SHALL
rebuild history from the active session branch after session start or reload and
SHALL NOT maintain cross-session global history.

#### Scenario: Stored payload has no version

- **WHEN** the active branch holds a notification entry without a `version`
- **THEN** the history reads it as version 1 and lists it

#### Scenario: Session is reloaded or resumed

- **WHEN** Pi reloads the extension or resumes a persisted session
- **THEN** notifications stored on the active session branch remain available
  through `/notifications`

#### Scenario: Session branch changes

- **WHEN** the user resumes or navigates to a branch with a different set of
  stored notification entries
- **THEN** the history reflects the notification entries on that active branch

#### Scenario: New session starts

- **WHEN** the user starts a new Pi session
- **THEN** its notification history begins independently of previous sessions

### Requirement: Notification history is browsable

The extension SHALL register `/notifications` as an interactive command. The
command SHALL open a two-pane browser: a list pane naming every notification on
the active branch newest first, and a detail pane showing the selected
notification's local date and time, severity, and complete message. Severities
SHALL be visually distinguished by color, and the command SHALL close on Pi's
configured cancel input. Its only argument is `status`: given any other, it
SHALL warn with the standard usage reply and do nothing else.

#### Scenario: User opens populated history

- **WHEN** the user runs `/notifications` after notifications have been captured
- **THEN** the list pane shows every notification on the active branch newest
  first with its time, severity, and a single-line preview, and the detail pane
  shows the newest notification in full

#### Scenario: User moves through the list

- **WHEN** the user moves the selection in the list pane
- **THEN** the highlighted row changes and the detail pane shows the newly
  selected notification

#### Scenario: User moves past either end of the list

- **WHEN** the user moves down from the oldest notification or up from the
  newest
- **THEN** the selection wraps around to the other end of the list

#### Scenario: List is longer than the list pane

- **WHEN** the active branch holds more notifications than the list pane has
  rows
- **THEN** the list pane's header shows the selection's position as `(n/m)`,
  and the header shows no position while every notification fits

#### Scenario: Severities are distinguishable

- **WHEN** the browser displays notifications of differing severity
- **THEN** each severity is rendered in its own theme color in both panes

#### Scenario: Selected message is longer than the detail pane

- **WHEN** the selected notification's message needs more rows than the detail
  pane shows
- **THEN** the user can scroll the detail pane to read the complete message

#### Scenario: User opens empty history

- **WHEN** the user runs `/notifications` before any notification has been
  captured in the active session
- **THEN** the command opens the same titled frame with no panes, showing the
  empty-state message `No notifications have been captured in this session
  yet.` and the close key

#### Scenario: User passes an argument

- **WHEN** the user runs `/notifications` followed by any non-blank argument
  other than `status`
- **THEN** no browser or summary is shown, and the extension warns
  `Unknown subcommand "<argument>". Try /notifications or /notifications status.`
  under the `Notification Center: 1 warning` heading

#### Scenario: User closes history

- **WHEN** the history browser is open and the user invokes the configured
  cancel action
- **THEN** the browser closes and keyboard focus returns to the prior component

### Requirement: History browser keys follow Pi's keybindings

The history browser SHALL act on Pi's `tui.select` keybindings: up and down move
the selection, page up and page down scroll the detail pane, and cancel closes
the browser. A key the user has remapped SHALL replace the default key rather
than add to it.

#### Scenario: User has remapped the keys

- **WHEN** the user has bound other keys to Pi's `tui.select` actions
- **THEN** the browser acts on those keys only and ignores the default keys

### Requirement: History browser footer lists the keys that work

The history browser's footer SHALL list only the keys that work, named by the
key the user has bound, as `↑/↓ Move`, `PgUp/PgDn Scroll Detail`, and
`Esc Close` with Pi's default keys. It SHALL wrap onto further lines between
hints rather than cut a hint off.

#### Scenario: Selected message fits the detail pane

- **WHEN** the selected notification's complete message fits the detail pane
- **THEN** the footer reads `↑/↓ Move · Esc Close`

#### Scenario: Selected message is longer than the detail pane

- **WHEN** the selected notification's message needs more rows than the detail
  pane shows
- **THEN** the footer reads `↑/↓ Move · PgUp/PgDn Scroll Detail · Esc Close`

#### Scenario: User has remapped the keys for the footer

- **WHEN** the user has bound other keys to Pi's `tui.select` actions
- **THEN** the footer names the bound keys instead of the defaults

#### Scenario: Footer is wider than the browser

- **WHEN** the footer's hints do not fit on one line
- **THEN** the footer continues on the next line, breaking only between hints,
  and every hint remains visible

### Requirement: History browser is sized to the notification being read

The history browser SHALL open centered in the terminal at 80% of its width,
widened to 60 columns where the terminal allows. It SHALL size itself to whichever of its panes needs
the most rows, bounded by 80% of the terminal height so its own header and
footer remain on screen. A notification whose complete message fits within that
bound SHALL be shown in full without requiring the user to scroll.

#### Scenario: Selected message fits the available height

- **WHEN** the user opens the browser and the selected notification's complete
  message needs no more rows than the terminal allows
- **THEN** the browser shows the whole message at once and offers no scrolling
  affordance

#### Scenario: Few notifications but a long message

- **WHEN** the active branch holds fewer notifications than the detail pane
  needs rows for the selected message
- **THEN** the browser is sized by the message rather than by the number of
  notifications

#### Scenario: Selected message exceeds the available height

- **WHEN** the selected notification's complete message needs more rows than the
  terminal allows
- **THEN** the browser stays within its share of the terminal height and the
  message remains reachable by scrolling

#### Scenario: Terminal is short

- **WHEN** the terminal is too short for the browser's preferred height
- **THEN** the browser shrinks to fit and keeps its header and footer on screen

### Requirement: History browser fits the width it is given

The history browser SHALL NOT draw any row wider than the width available to it.
When the terminal is too narrow to show two legible panes, the extension SHALL
omit the browser rather than draw a cut-off frame, and `/notifications` SHALL
instead report how many notifications the active branch holds as a plain
notification. The browser SHALL remain usable at every width that can hold two
legible panes, shrinking both panes toward their minimum rather than
overflowing.

#### Scenario: Terminal is narrower than the browser needs

- **WHEN** the user runs `/notifications` on a terminal too narrow for two
  legible panes
- **THEN** no browser opens and the extension reports how many notifications the
  active branch holds as a plain notification

#### Scenario: Terminal is too narrow and no notification has been captured

- **WHEN** the user runs `/notifications` on a terminal too narrow for two
  legible panes and no notification has been captured in the active session
- **THEN** no browser opens and the extension reports the same empty-state
  message as a plain notification

#### Scenario: Terminal is narrow but wide enough

- **WHEN** the terminal is narrower than the browser's preferred width but still
  wide enough for two legible panes
- **THEN** the browser is drawn inside the terminal width with both panes
  narrowed, and no row extends past the terminal's last column

#### Scenario: Terminal becomes too narrow while the browser is open

- **WHEN** the user narrows the terminal below two legible panes while the
  browser is open
- **THEN** the browser draws nothing rather than a cut-off frame, reappears when
  the terminal is widened again, and still closes on the configured cancel
  action

### Requirement: Hidden detail content is advertised

When the detail pane shows only part of the selected message, the browser SHALL
report the position of the visible portion within the whole message, and SHALL
mark each visible edge that has more content beyond it. Both indications SHALL
update as the user scrolls, so reaching the start or the end of a message is
observable. A message shown in full SHALL carry neither indication.

#### Scenario: Message is longer than the detail pane

- **WHEN** the detail pane shows the start of a message that continues beyond
  its last visible row
- **THEN** the browser reports the visible position within the whole message and
  marks the last visible row as having more content below it

#### Scenario: User scrolls into the middle of a message

- **WHEN** the visible portion has content both before and after it
- **THEN** the browser marks the first visible row as having more content above
  it and the last visible row as having more content below it

#### Scenario: User reaches the end of a message

- **WHEN** the user scrolls to the last row of the message
- **THEN** the reported position shows the end has been reached and no marker
  claims further content below

#### Scenario: Message is shown in full

- **WHEN** the entire message is visible
- **THEN** the browser reports no position and marks no edge

### Requirement: Runtime cleanup is safe

The extension SHALL cancel its timers, remove its toast surface, and stop using
stale session UI state when the session shuts down or extensions reload.

#### Scenario: Reload occurs while toasts are visible

- **WHEN** Pi reloads or replaces the session while toast timers are active
- **THEN** the old runtime removes its surface and timers without later changing
  the new runtime's UI

### Requirement: Package follows Pi installation conventions

The repository SHALL expose the extension through the `pi.extensions` package
manifest and SHALL support installation through Pi's npm package mechanism. It
SHALL use only terminal UI output and SHALL NOT issue operating-system
notifications.

#### Scenario: Package is installed through Pi

- **WHEN** a user installs the published npm package with
  `pi install npm:@sherif-fanous/pi-notification-center`
- **THEN** Pi discovers and loads the extension entry point declared by the
  package

#### Scenario: Captured notification is displayed

- **WHEN** the notification center presents a captured notification
- **THEN** all visible output remains inside Pi's terminal UI and no
  operating-system notification is sent
