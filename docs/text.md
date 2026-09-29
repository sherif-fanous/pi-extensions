# Text and naming

The standard for everything an extension shows. Each package has one test that
runs its commands' main paths with `createShownTextRecorder` (from
`pi-extensions-testing`) plugged into its fakes and expects
`findShownTextViolations(shown, { displayName, slug })` to return `[]`. That
check enforces the mechanical rules (product names and their casing, `(s)`
plurals, full stops, description shape, report headings and labels, internal key
shapes), and its failure messages say what to fix. The rules below are the ones
it can't check.

- Prose: this covers `README.md`, `CHANGELOG.md`, changesets, `CONTRIBUTING.md`,
  notifications and warnings, overlay bodies, empty states, footer hints, and
  command descriptions. Run the `humanizer` and `unslop` skills over it and
  apply what they report. Without them, at least: no em or en dashes, no AI
  stock vocabulary, no bold-label lists, active voice, sentence case.
- Audiences: `README.md`, `CHANGELOG.md`, and changesets are for someone using
  the extension, so they leave out internal names, event names, and mechanism (a
  user can't act on `ctx.ui.notify`). `CONTRIBUTING.md` is for someone changing
  the code, so technical terms belong there.
- Names: the display names are `RTK`, `Theme Sync`, `Presets Plus`,
  `Notification Center`, and `Session Slice`. Each package exports one
  `EXTENSION_NAME` constant from `src/extension-name.ts`, used by every
  `guardCommand`, `onEvent`, `notifyWarnings`, `notifyUsageWarning`, and
  `requireInteractiveTui` call, dialog title, and report heading. `Pi` is the
  product and `pi` the binary; lowercase `rtk` means only the rtk executable.
  Command names stay literal (`/presets clear`).
- Labels and titles: dialog titles, report headings, and button and footer
  action labels are Title Case (`Move Preset?`, `Presets Plus Policy`, `Save`).
  Key/value labels are sentence case with a colon (`Applied theme:`); form rows
  use the same text without the colon.
- Descriptions (commands, flags, completions): Pi's style, starting with a verb.
  Use the display name where the command name doesn't imply the product, and
  never list subcommands (`Configure Theme Sync or show its status`).
- Usage mistakes: `notifyUsageWarning(ctx, EXTENSION_NAME, args, forms)`, with
  the bare command first in `forms`, then every subcommand. Subcommands match
  the whole trimmed argument, so `status foo` is a mistake. A command that takes
  no argument rejects any argument the same way and does not run.
- Severity: `info` for the outcome of a successful action or a neutral fact,
  including no-change messages (`No changes to save.`); `warning` for something
  the user can fix (usage mistakes, unknown names, a feature unavailable in this
  mode); `error` for an unexpected failure (I/O, a thrown error). Notifications
  report outcomes, never progress: progress is a busy line inside the surface
  that's waiting (see [tui.md](tui.md)).
- Info and success texts: plurals come from core's `pluralize`. A reply to the
  command the user just ran doesn't name the extension (`Reloaded 3 presets.`).
  A message the user didn't ask for (startup, background work, hotkeys) names it
  as the subject (`Presets Plus migrated its configuration to <path>.`).
- Handled errors go through core. In a command or event handler, let the error
  reach `guardCommand` or `onEvent`. An unprompted failure outside the guards
  mirrors them: `<Display Name> <thing> failed: <message>`
  (`Presets Plus hotkey failed: …`). A failure shown in reply to the user, such
  as an overlay message, reads `Could not <verb> <object>: <message>`
  (`Could not save the configuration: …`). `<message>` is
  `describeErrorSentence(error)`; use `describeError` mid-sentence. No local
  error formatters and no `(error as Error).message`.
- Reports: lay the body out with `formatReport` and send it through
  `createCommandReport`, never as a plain `notify`. The body is the heading
  `<Display Name> <Thing>`, an optional unindented lead sentence, the aligned
  `Label: value` rows (a row may instead be an indented sentence, such as
  `No preset is active.`), then the `Config:` block, then the warnings last, in
  one `Warnings:` block of `- ` lines, with a blank line between blocks. Values:
  `on`/`off` for toggles, `none` for an absent value, `never` for a time never
  set; no `yes`/`no`, `enabled`/`disabled`, or `n/a`.
- Scopes: label them `User` and `Project`, as Pi does, never `Global`.
- Internal keys: the slug is the package folder without `pi-` and is also the
  config directory name. Transcript entry types, widget keys, and message types
  are `<slug>:<thing>`. The footer status key is the bare `<slug>`: each
  extension has at most one footer entry, and Pi orders footer entries by key.
