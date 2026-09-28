# tui-primitives Specification

## Purpose

Give the extensions' interactive surfaces one frame, one key-hint notation, one
reading of Pi's list keybindings, one list model, and two overlay sizes, so
every overlay looks and behaves the same and fits any terminal width.

## Requirements

### Requirement: Frames fit their width

The package SHALL export `padToWidth`, `frameLine`, `frameSegment`, `frameTop`,
and `renderFrame`. Each SHALL measure widths in visual columns and return lines
exactly `width` columns wide, or nothing for a width of zero or less. Text that
does not fit SHALL be truncated with `…`. Borders SHALL be drawn with box
characters in the theme's `border` color.

#### Scenario: Styled and wide text

- **WHEN** `padToWidth` receives styled text or wide characters
- **THEN** the result is exactly `width` visual columns wide

#### Scenario: A frame on a narrow terminal

- **WHEN** `renderFrame` draws a body row wider than the frame at width 20, 8,
  3, or 1
- **THEN** every line it returns is exactly that many columns wide

### Requirement: Frame layout

`renderFrame({ title, titleRight?, body, footer, theme, width })` SHALL return a
top border carrying the title in bold accent (`┌─ Title ───┐`), one row per body
line padded by one space on each side, a `├───┤` rule, one dim row per footer
line, and a `└───┘` bottom border. With an empty footer it SHALL draw no rule.
`titleRight` SHALL sit at the right end of the top border with the caller's
styling, and SHALL be dropped before the title is truncated when the border
cannot hold both.

#### Scenario: A framed list

- **WHEN** `renderFrame` receives the title `Presets Plus`, two body rows, and
  two footer lines at width 30
- **THEN** it returns seven lines: the titled top border, the two padded body
  rows, the rule, the two footer rows, and the bottom border

#### Scenario: A position that does not fit

- **WHEN** `frameTop` receives the title `Title` and the right text `(3/12)` at
  width 16
- **THEN** it returns `┌─ Title ──────┐` without the position

### Requirement: Frame sizing

`frameBodyWidth(width)` SHALL return the columns a body row has inside a frame
`width` wide, and `frameBodyRows(height, footerLineCount)` the body rows that
fit in a frame `height` rows tall with that many footer lines.

#### Scenario: Sizing the body

- **WHEN** a body of `frameBodyRows(12, 2)` rows is framed with a two-line
  footer
- **THEN** the frame is 12 lines tall

### Requirement: Key hints follow the user's keybindings

`keyText(keybindings, keybinding)` SHALL return the first key bound to the
keybinding, spelled by `formatKeyId`, or `undefined` when no key is bound.
`keyHint(keybindings, keybinding | keybindings[], action)` SHALL return the
bound keys joined with `/`, a space, and the action, leaving out unbound
keybindings and returning `undefined` when none is bound.

#### Scenario: Default keys

- **WHEN** `keyHint` receives Pi's default keybindings, `tui.select.up` and
  `tui.select.down`, and the action `Move`
- **THEN** it returns `↑/↓ Move`

#### Scenario: A remapped key

- **WHEN** the user bound `tui.select.up` to `k` and `tui.select.down` to `j`
- **THEN** `keyHint` returns `k/j Move`

#### Scenario: An unbound key

- **WHEN** the user bound no key to `tui.select.pageUp` or `tui.select.pageDown`
- **THEN** `keyHint` for both returns `undefined`

### Requirement: Key spelling

`formatKeyId(key)` SHALL spell arrows as `↑ ↓ ← →`, Escape as `Esc`, Enter as
`Enter`, page keys as `PgUp` and `PgDn`, other named keys and modifiers in Title
Case joined with `+` (`Ctrl+S`, `Shift+Tab`, `F1`), a letter after a modifier in
upper case, and a bare printable key as typed.

#### Scenario: A chord

- **WHEN** `formatKeyId` receives `ctrl+s`
- **THEN** it returns `Ctrl+S`

#### Scenario: A bare letter

- **WHEN** `formatKeyId` receives `n`
- **THEN** it returns `n`

### Requirement: Key hints wrap between hints

`wrapKeyHints(hints, width)` SHALL join the hints with `·` and start a new line
before a hint that would overflow `width`, so no hint is cut. It SHALL skip
`undefined` and empty hints, and SHALL truncate with `…` only a single hint
wider than a whole line.

#### Scenario: A footer wider than the frame

- **WHEN** `wrapKeyHints` receives `↑/↓ Move`, `PgUp/PgDn Page`, `Enter Select`,
  `F1 Help`, and `Esc Close` at width 30
- **THEN** it returns `↑/↓ Move · PgUp/PgDn Page`, `Enter Select · F1 Help`, and
  `Esc Close`

### Requirement: List keys come from Pi's keybindings

`matchSelectAction(keybindings, data)` SHALL return the `SelectAction` (`up`,
`down`, `pageUp`, `pageDown`, `confirm`, or `cancel`) whose `tui.select.*`
keybinding matches `data`, checked in that order, or `undefined`. Only the
user's bound keys SHALL match: a remap replaces the default keys.

#### Scenario: Pi's default cancel keys

- **WHEN** `matchSelectAction` receives Escape or Ctrl+C under Pi's default
  keybindings
- **THEN** it returns `cancel`

#### Scenario: A remapped cancel key

- **WHEN** the user bound `tui.select.cancel` to `q`
- **THEN** `matchSelectAction` returns `cancel` for `q` and `undefined` for
  Escape and Ctrl+C

### Requirement: The help key matches every F1 encoding

`matchesHelpKey(data)` SHALL return `true` for an F1 press in the legacy
encodings `matchesKey` recognizes and in the Kitty keyboard protocol's press
encodings (`CSI 1 P` and `CSI 57364 u`, with or without the unmodified
modifier and press event subfields), and `false` for an F1 release, a modified
F1, and any other key.

#### Scenario: Ghostty's F1

- **WHEN** `matchesHelpKey` receives `\x1b[1;1:1P`
- **THEN** it returns `true`

#### Scenario: An F1 release

- **WHEN** `matchesHelpKey` receives `\x1b[57364;1:3u`
- **THEN** it returns `false`

### Requirement: One list model

`moveListSelection(selected, count, move, pageSize)` SHALL move one item for
`up` and `down`, wrapping from one end to the other, and `pageSize` items (at
least one) for `pageUp` and `pageDown`, stopping at the first or last item. It
SHALL return 0 for an empty list.

#### Scenario: Wrapping at the end

- **WHEN** the last of five items is selected and the move is `down`
- **THEN** `moveListSelection` returns 0

#### Scenario: Paging at the end

- **WHEN** item 9 of ten is selected and the move is `pageDown` with a page of 3
- **THEN** `moveListSelection` returns 9

### Requirement: List window and position

`listWindow(selected, count, rows)` SHALL return the `start` and exclusive `end`
of the visible items, keeping the selection centered where the ends allow, and
`position` as `listPosition`'s 1-based `(n/m)` when the list has more items than
rows, else `undefined`.

#### Scenario: A list that scrolls

- **WHEN** `listWindow` receives item 6 of 12 with 5 rows
- **THEN** it returns start 4, end 9, and position `(7/12)`

### Requirement: Scrolled bodies show where more text is

`scrollLines(lines, rows, offset, width, theme)` SHALL return `rows` lines from
`offset`, clamping the offset so the window never runs past either end, with
every row fitted to `width`. When lines are hidden above, the first row SHALL
end in a dim `↑`; when hidden below, the last row SHALL end in a dim `↓`; a lone
row with lines hidden on both sides SHALL end in `↕`.

#### Scenario: A body scrolled to the middle

- **WHEN** `scrollLines` shows three of five lines from offset 1 at width 8
- **THEN** the first row ends in `↑`, the last in `↓`, and the offset is 1

### Requirement: Empty states are muted sentences

`emptyStateLines(message, width, theme)` SHALL return the message in the theme's
`muted` color, wrapped to `width`.

#### Scenario: A narrow empty state

- **WHEN** `emptyStateLines` receives `No presets yet. Press n to create one.`
  at width 10
- **THEN** every line fits in 10 columns

### Requirement: Two overlay sizes

`overlayOptions("main")` SHALL return `anchor: "center"`, `margin: 1`,
`width: "80%"`, `minWidth: 60`, and `maxHeight: "80%"`.
`overlayOptions("nested")` SHALL return the same anchor, margin, and maximum
height with `width: "50%"` and `minWidth: 48`. `overlayMaxHeight(terminalRows)`
SHALL return the rows Pi gives either size: 80% of `terminalRows` rounded down,
no more than `terminalRows - 2`, and at least 1.

#### Scenario: A 40-row terminal

- **WHEN** `overlayMaxHeight` receives 40
- **THEN** it returns 32
