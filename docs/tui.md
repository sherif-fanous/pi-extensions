# TUI

The standard for every interactive surface: overlays, dialogs, and inline
pickers. Core implements it (its README's "TUI API" section); use those helpers
instead of drawing borders, hints, or list movement by hand.

- Opening: check `isInteractiveTui(ctx)` before any `ctx.ui.custom`, and fall
  back to a text version or `requireInteractiveTui`'s notice. `ctx.ui.select`
  and `ctx.ui.confirm` also work for RPC clients, so gate them on `ctx.hasUI`
  and fall back only in print and JSON mode. Open overlays with
  `overlayOptions("main")` for a top-level surface (picker, browser, editor,
  config form) or `overlayOptions("nested")` for a dialog opened from one
  (confirmation, info text, sub-selector). Both are centered with a margin of 1
  and at most 80% of the terminal height; main is 80% wide (at least 60
  columns), nested 50% (at least 48). No other sizes, anchors, or margins.
  Session Slice's picker stays inline in Pi's main screen, like Pi's `/fork`,
  with no frame, but follows every other rule here: an accent title, the list
  model, the markers, and a dim key-hint line. Like `/fork`, it shows at most
  ten messages and doesn't fit itself to the terminal height.
- Height: a surface lays itself out to `overlayMaxHeight(terminalRows)` and
  scrolls whatever is taller (`scrollLines`, `listWindow`), keeping the focused
  row and the footer visible. Pi keeps only the top rows of a taller render, so
  never rely on it to cut.
- Frame: `renderFrame`. The border uses box characters in the theme's `border`
  color. The title sits in the top border (`┌─ Title ───┐`), bold accent, in
  Title Case, with names in double quotes and a question ending in `?`
  (`Delete "coding"?`). The body is padded one space inside the border and never
  repeats the title. A `├───┤` rule separates the dim footer, then `└───┘`.
  Muted text such as a position may sit at the right of the top border
  (`titleRight`). Layouts `renderFrame` does not cover (split panes, toast
  cards) are built from `frameTop`, `frameLine`, and `frameSegment`.
- Width: every line a component returns fits the width it was given; Pi stops
  with an error on a wider line in its main screen and cuts overlays off.
  Truncate with `…`, never `...`. Text the cursor can reach is never truncated
  away: wrap or scroll it. Render tests include a width of 40 or less and expect
  `findOverflowingLines(lines, width)` to return `[]`.
- Key hints: the footer lists the keys that work in the current mode as
  `<Key> <Action>` pairs joined by a middle dot with a space on each side, such
  as `↑/↓ Move · Enter Select · Esc Close`. The action is a Title Case verb
  (`Move`, `Page`, `Select`, `Open`, `Edit`, `Save`, `Filter`, `Help`). Order:
  movement (`↑/↓ Move`, `PgUp/PgDn Page`, `←/→ …`), then the Enter action, then
  secondary actions, then Esc last. Esc reads `Esc Close` on a top-level
  surface, `Esc Cancel` when it discards a draft or a choice, and `Esc Back`
  when it returns from a nested step or mode. Keys are spelled as `formatKeyId`
  spells them: `↑/↓`, `←/→`, `PgUp/PgDn`, `Enter`, `Esc`, `Tab`, `Space`,
  `Ctrl+S`, `F1`, and bare keys as typed (`n New`, `/ Filter`); never `⏎`, `⇥`,
  `^S`, `Ctrl-S`, or a sentence (`Press Enter to …`). Related keys share one
  hint with `/` and no spaces. Never list Ctrl+C. A hint for a Pi keybinding
  comes from `keyHint`, so it names the key the user has bound and disappears
  when nothing is bound; only keys with no keybinding id (`F1`, letter keys,
  extension chords such as `Ctrl+S`) are written literally. Lay the footer out
  with `wrapKeyHints(hints, frameBodyWidth(width))`, which wraps between hints;
  a footer is never truncated.
- Keys: navigation, confirm, and cancel come from Pi's keybindings through
  `matchSelectAction` (`tui.select.up`, `down`, `pageUp`, `pageDown`, `confirm`,
  `cancel`), never from `Key.up`, `Key.escape`, and the like. A user's remap
  replaces the default keys; never also accept the default. Only
  extension-specific chords are matched with `matchesKey` (`Ctrl+S`, `Ctrl+T`,
  `Ctrl+↑/↓`, `F1`). Every form (an overlay of editable fields: the Presets Plus
  editor, the Theme Sync config form) has `F1 Help` for the focused field.
- Lists: one model, `moveListSelection`. `↑/↓` move one item and wrap around the
  ends; `PgUp/PgDn` move one page and stop at the first or last item. Every list
  that can scroll handles `PgUp/PgDn` and shows `PgUp/PgDn Page`. In a
  list-plus-detail view, `PgUp/PgDn` scroll the detail pane. `listWindow` keeps
  the selection centered. A list with more items than rows shows its muted
  `(n/m)` position: at the right of the top border (or its pane's title) in a
  frame, on a muted line below an unframed list.
- Selection: one marker per kind of list. An accent `→ ` before the selected row
  of a simple one-line list, as in Pi's own lists. An accent `▌` at the left
  edge of the selected multi-line card or form row. The theme's `selectedBg`
  background across the selected row of a table or split-pane list. `●` and `○`
  for the chosen and other options of a choice, such as a confirmation's
  buttons.
- Empty states: `emptyStateLines`, a muted sentence with a full stop,
  left-aligned in the body, that says what is empty and then the next step when
  there is one. Nothing-yet and no-match read differently:
  `No presets yet. Press n to create one.` and `No presets match this filter.`
- Colors by meaning: `accent` for titles and selection markers; `muted` for
  labels, secondary metadata, positions, and empty states; `dim` for footers,
  key hints, placeholders, scroll markers, and busy lines; `border` for frame
  borders; `success`, `warning`, and `error` only for the severity of a real
  outcome or problem, never for busy, no-change, or empty states.
- Busy: while input waits on async work, the footer shows one dim busy line in
  place of the hints: a sentence-case `-ing` phrase ending in `…`, such as
  `Saving configuration…` or `Activating "coding"…`. Progress is never a
  notification; notifications report outcomes (see [text.md](text.md)).
- README keys: every README whose extension has an interactive surface documents
  its keys in a table right after the text describing that surface, with Pi's
  default keys and the rows in footer order:

  ```markdown
  | Key             | Action             |
  | :-------------- | :----------------- |
  | `↑` / `↓`       | Move the selection |
  | `PgUp` / `PgDn` | Move one page      |
  | `Enter`         | Open the selection |
  | `Esc`           | Close              |
  ```

  Each key is in its own backticks, with grouped keys separated by a slash with
  a space on each side, as above; actions are sentence-case phrases without a
  full stop. Follow the table with
  `If you have remapped Pi's keys, the <surface> follows your bindings.` when
  any row is a Pi keybinding.
