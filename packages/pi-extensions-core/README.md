# pi-extensions-core

A [Pi](https://github.com/earendil-works/pi) extension library that provides
shared helpers for errors, config files, reports, and TUI surfaces.

The extensions in
[pi-extensions](https://github.com/sherif-fanous/pi-extensions) depend on it.
Every export is stateless. Each installed extension may load its own copy of
this package, so nothing here keeps module-level state.

## Requirements

- Tested only against the latest stable release of
  [Pi](https://github.com/earendil-works/pi)

`@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` are peer
dependencies, so the extension uses the copies Pi provides.

## Install

```shell
pnpm add @sherif-fanous/pi-extensions-core
```

Inside the pi-extensions workspace, depend on it as `workspace:*`.

## Usage

Import the helpers by name. The package ships TypeScript sources, which Pi loads
directly.

```ts
import { EXTENSION_NAME } from "./extension-name.js";
import { guardCommand } from "@sherif-fanous/pi-extensions-core";

pi.registerCommand("slice", {
  description: "Start a new session from a range of this one",
  handler: guardCommand(EXTENSION_NAME, runSlice),
});
```

## API

### `describeError(error: unknown): string`

Returns the message of an `Error`, or the thrown value converted to a string.
The result carries no trailing punctuation, so callers can embed it
mid-sentence.

```ts
import { describeError } from "@sherif-fanous/pi-extensions-core";

warnings.push(`Skipped preset "${name}" (${describeError(err)}).`);
```

### `describeErrorSentence(error: unknown): string`

Returns the `describeError` text followed by a full stop, unless it already ends
in `.`, `!`, or `?`. Use it when the error ends the sentence, so the text never
shows `..`.

```ts
import { describeErrorSentence } from "@sherif-fanous/pi-extensions-core";

ctx.ui.notify(
  `Could not save the configuration: ${describeErrorSentence(err)}`,
  "error",
);
```

### `pluralize(count: number, singular: string, plural?: string): string`

Returns the count followed by the noun in the matching number: `1 preset`,
`0 presets`, `3 presets`. `plural` defaults to `singular` followed by `s`; pass
it for irregular nouns.

```ts
import { pluralize } from "@sherif-fanous/pi-extensions-core";

ctx.ui.notify(`Sliced ${pluralize(count, "entry", "entries")}.`, "info");
```

### `isRecord(value: unknown): value is Record<string, unknown>`

Returns `true` when a value is an object other than `null` or an array, and
narrows it so callers can read properties of parsed JSON. Class instances also
pass, since the check does not inspect the prototype.

```ts
import { isRecord } from "@sherif-fanous/pi-extensions-core";

const parsed: unknown = JSON.parse(text);
if (!isRecord(parsed)) throw new Error("expected a JSON object");
```

### `isNotFoundError(error: unknown): boolean`

Returns `true` when a thrown value carries the `ENOENT` code, meaning the file
does not exist. Any object with that code passes, not only `Error` instances.

```ts
import { isNotFoundError } from "@sherif-fanous/pi-extensions-core";

try {
  return await readFile(path, "utf8");
} catch (error) {
  if (isNotFoundError(error)) return undefined;
  throw error;
}
```

### `createCommandReport(entryType: string): CommandReportChannel`

Returns the functions that show a command's plain-text report of type
`CommandReport` (`{ body, severity? }`, where `severity` is `"info"` or
`"warning"` and defaults to `"info"`):

- `deliver(ctx, pi, report)` appends the report as a transcript entry of type
  `entryType` in TUI mode, and notifies with the styled body at the report's
  severity in every other mode.
- `render` renders a stored entry as text styled with the current theme.
- `register(pi)` registers `render` for `entryType`. Call it when the extension
  loads so reports restored from a session render too.

The body is stored as plain text, so a restored report takes the theme active
when it is shown.

```ts
import {
  createCommandReport,
  formatReport,
} from "@sherif-fanous/pi-extensions-core";

const statusReport = createCommandReport("theme-sync:status-report");

export default function themeSync(pi: ExtensionAPI): void {
  statusReport.register(pi);
  pi.registerCommand("theme-sync", {
    handler: async (_args, ctx) => {
      const body = formatReport("Theme Sync", "Status", {
        rows: [
          ["Appearance:", "dark"],
          ["Applied theme:", "solarized-dark"],
        ],
      });

      statusReport.deliver(ctx, pi, { body });
    },
  });
}
```

### `formatReport(displayName: string, thing: string, parts: ReportParts): string`

Lays out a plain report body from `{ lead?, rows, config?, warnings? }`:

- the heading `<displayName> <thing>`, such as `Theme Sync Status`;
- `lead`, a sentence on the next line, not indented;
- `rows`, each a `[label, value]` pair or a sentence. Every row is indented by
  two spaces, and each pair's label is padded to the longest label so the values
  line up;
- `config`, the `Config:` block, such as a `ConfigOutcome`'s `statusLines`;
- `warnings`, as a `Warnings:` line and one `- <warning>` line each.

A blank line separates the rows, the `Config:` block, and the warnings. An
absent lead and an empty `config` or `warnings` are left out.

```ts
formatReport("Presets Plus", "Status", {
  config: outcome.statusLines,
  rows: [
    ["Preset:", "plan"],
    ["Scope:", "User"],
  ],
  warnings: outcome.statusWarnings,
});
```

```text
Presets Plus Status
  Preset: plan
  Scope:  User

Config:
  User:    loaded
           /Users/me/.pi/agent/presets-plus/config.json
  Project: not found
           /repo/.pi/presets-plus/config.json

Warnings:
- Skipped preset 1 in /Users/me/.pi/agent/presets-plus/config.json: It needs a name.
```

### `styleReport(body: string, theme: Pick<Theme, "bold" | "fg">): string`

Styles a plain report body line by line. The first line is the heading, in bold
accent. A `Warnings:` line and every line after it are warning-colored. On any
other line that is not a `- ` list item, the text up to and including the first
colon, when whitespace or the line end follows it, is a muted label. Remaining
lines are unchanged. `createCommandReport` applies these rules; call
`styleReport` directly to show a report on another surface, such as a dialog.

### `guardCommand(extensionName: string, handler): handler`

Wraps a command handler. When the handler throws or rejects, the wrapper
notifies `<extensionName> command failed: <message>` at error severity instead
of letting Pi show its generic extension error row, and never rethrows.
`<message>` is the `describeError` text with a full stop added unless it already
ends in `.`, `!`, or `?`.

### `onEvent(pi, extensionName: string, event, handler): void`

Registers `handler` with `pi.on` for `event`, guarded. A successful handler's
result, such as a `before_agent_start` system prompt, passes through unchanged.
When the handler throws or rejects, the registered handler notifies
`<extensionName> <event> failed: <message>` at error severity and resolves to
`undefined`, which Pi treats as no result. The event is named once: the
handler's event type comes from it, and a result the event does not accept fails
to compile, reported at the `pi` argument. Every Pi event except `project_trust`
can be registered this way.

```ts
import { guardCommand, onEvent } from "@sherif-fanous/pi-extensions-core";

export default function themeSync(pi: ExtensionAPI): void {
  pi.registerCommand("theme-sync", {
    handler: guardCommand("Theme Sync", (args, ctx) =>
      runThemeSyncCommand(args, ctx),
    ),
  });
  onEvent(pi, "Theme Sync", "session_start", (_event, ctx) =>
    startMonitoring(ctx),
  );
}
```

### `notifyWarnings(ctx: GuardContext, extensionName: string, warnings: readonly string[]): void`

Shows every warning one operation produced as one warning notification, headed
`<extensionName>: <n> warning` (or `warnings`) with one `- <warning>` line per
warning in order. An empty list shows nothing. Like the guards, it is best
effort: a `notify` that throws on a stale context is ignored.

Word each warning as a sentence that does not name the extension, since the
heading already does: first what is wrong and where, then, optionally, what
happens instead, such as `Ignored the file.` or `Skipped it.`

```ts
import { notifyWarnings } from "@sherif-fanous/pi-extensions-core";

const { config, warnings } = loadConfig();

notifyWarnings(ctx, "Notification Center", warnings);
// Notification Center: 1 warning
// - Configuration at /agent/notification-center/config.json must be a JSON object. Ignored the file.
```

### `notifyUsageWarning(ctx: GuardContext, extensionName: string, argument: string, forms: readonly [string, ...string[]]): void`

Answers an argument the command does not accept with one warning through
`notifyWarnings`. `forms` lists every valid way to run the command as the user
types it; a command that takes no argument passes only its bare form. The
argument is trimmed.

```ts
import { notifyUsageWarning } from "@sherif-fanous/pi-extensions-core";

notifyUsageWarning(ctx, "RTK", args, [
  "/rtk",
  "/rtk enable",
  "/rtk disable",
  "/rtk status",
]);
// RTK: 1 warning
// - Unknown subcommand "foo". Try /rtk, /rtk enable, /rtk disable, or /rtk status.

notifyUsageWarning(ctx, "Notification Center", args, ["/notifications"]);
// Notification Center: 1 warning
// - Unknown subcommand "foo". Try /notifications.
```

### `subcommandCompletions(subcommands: readonly SubcommandCompletion[])`

Returns a `getArgumentCompletions` function for fixed subcommands, each
`{ name, description? }`. Only the first word completes: after leading
whitespace is ignored, a prefix containing a space returns `null`. Otherwise the
function returns the subcommands whose names start with the prefix, or `null`
when none match. Each completion is labeled with the name alone and carries the
description in its `description` field, which Pi shows as a dimmed column beside
the name, as it does for its own commands.

```ts
import { subcommandCompletions } from "@sherif-fanous/pi-extensions-core";

pi.registerCommand("rtk", {
  getArgumentCompletions: subcommandCompletions([
    { name: "enable", description: "Rewrite shell commands with RTK" },
    { name: "disable", description: "Stop rewriting shell commands" },
    { name: "status", description: "Show RTK status" },
  ]),
  handler,
});
```

### `isInteractiveTui(ctx: Pick<ExtensionContext, "mode">): boolean`

Returns `true` when Pi runs its interactive terminal UI (`ctx.mode` is `"tui"`)
and `false` for `print`, `json`, and `rpc`. Use it to guard terminal-only work
such as overlays and terminal queries; `ctx.hasUI` is also `true` under RPC,
where TUI-backed methods are degraded or no-ops.

### `requireInteractiveTui(ctx, extensionName: string, command: string): boolean`

Gates a command that opens a terminal overlay. Returns `true` in the interactive
terminal UI. In `print`, `json`, and `rpc` it shows one warning through
`notifyWarnings` and returns `false`, since Pi's `ctx.ui.custom` resolves
`undefined` there without showing anything. Pass the command as the user types
it. Commands with a text equivalent, such as a summary notification, should fall
back to it with `isInteractiveTui` instead.

```ts
import { requireInteractiveTui } from "@sherif-fanous/pi-extensions-core";

if (!requireInteractiveTui(ctx, "Session Slice", "/slice")) return;
// Session Slice: 1 warning
// - /slice needs Pi's interactive terminal UI. Run it from the TUI.
```

## Config API

The helpers behind every extension's `config.json`. The rules they implement are
in the repository's `docs/config.md`.

### `defineConfigFile(description): ConfigFileHandle`

Describes an extension's `config.json` once and returns the handle every other
operation goes through. The description is:

- `extension`: the slug, which names the configuration directory.
- `extensionName`: the display name startup messages name, such as `Theme Sync`.
- `scopes`: the scopes the extension has, such as `["user", "project"]` or
  `["user"]`.
- `version`: the `version` this release reads and writes.
- `renamedKeys?`: `{ from, to }` pairs of dot-separated paths, such as
  `{ from: "toast.timeout", to: "toast.timeoutMs" }`, read under the old name
  while the new one is absent.
- `legacyFileNames?`: names of files an older release read beside `config.json`,
  such as `presets.json`. In an untrusted project without `config.json`, the
  first of these that exists is reported as the skipped project file.

Every handle operation takes the handler context (`cwd` and
`isProjectTrusted()`), which it asks about trust only for a project file. The
User file lives in Pi's agent directory, `getAgentDir()`, which honors
`PI_CODING_AGENT_DIR`; tests move it with `createTempConfigDirs` from
`pi-extensions-testing`.

```ts
import { defineConfigFile } from "@sherif-fanous/pi-extensions-core";

export const THEME_SYNC_CONFIG = defineConfigFile({
  extension: "theme-sync",
  extensionName: "Theme Sync",
  renamedKeys: [{ from: "isSyncActive", to: "syncEnabled" }],
  scopes: ["user", "project"],
  version: 2,
});
```

### `handle.path(ctx, scope): string`

Returns `<agentDir>/<extension>/config.json` for `"user"` and
`<cwd>/.pi/<extension>/config.json` for `"project"`. An old layout a migration
reads sits beside it.

### `handle.read(ctx, scope): Promise<ConfigFile>`

### `handle.load(ctx): Promise<ConfigOutcome>`

`read` reads one scope's file; `load` reads every scope's and returns them in a
`ConfigOutcome`. Neither throws for a file problem. Each `ConfigFile` has
`scope`, `path`, and a `state`:

- `"loaded"`: the file is a JSON object whose `version` is absent (meaning the
  current one) or equal to `version`. `data` holds it with renamed keys moved to
  their new names, and `renamedKeys` lists the old names found.
- `"missing"`: no file. Use the defaults and say nothing.
- `"invalid"`: unreadable, not valid JSON, not an object, or another `version`.
  `reason` is a short phrase for the status block (`not valid JSON: …`,
  `not a JSON object`, `unreadable: …`, `unsupported version 3`); `warning` is
  the sentence to show once:

  ```text
  Could not read configuration at <path>: <message>. Ignored the file.
  Configuration at <path> is not valid JSON: <message>. Ignored the file.
  Configuration at <path> must be a JSON object. Ignored the file.
  Configuration at <path> has version 3, but only version 2 is supported. Ignored the file.
  ```

- `"untrusted"`: a project file exists, but Pi does not trust the project, so it
  was not read. `warning` reads
  `Skipped project configuration at <path> because the project is not trusted. Trust the project to use it.`
  An untrusted project without the file is `"missing"`, so it stays silent.

### `handle.update(ctx, scope, update): Promise<void>`

Reads the file again, passes its data (with renamed keys moved, or `{}` when
missing) to `update`, and writes the result atomically with the current
`version` first. Throws, leaving the file untouched, when the scope is a project
Pi does not trust
(`The project is not trusted, so <path> was not saved. Trust the project and try again.`),
when the file is invalid
(`<path> is invalid (<reason>). Fix the file and try again.`), so a malformed
file or one from a newer release is never overwritten, or when the write fails.

```ts
import { describeErrorSentence } from "@sherif-fanous/pi-extensions-core";

try {
  await THEME_SYNC_CONFIG.update(ctx, scope, (data) => ({
    ...data,
    syncEnabled: false,
  }));
} catch (error) {
  this.message = `Could not save the configuration: ${describeErrorSentence(error)}`;
}
```

### `handle.write(ctx, scope, document): Promise<void>`

Writes `document` atomically as the scope's file, with renamed keys moved and
the current `version` first, whatever the file holds now. Use it to migrate an
old layout; saves go through `update`. Throws, leaving the file untouched, when
the scope is a project Pi does not trust or the write fails.

### `handle.migrateKeys(ctx): Promise<ConfigMigration>`

Rewrites every file that still uses an old key name under the new names with the
current `version`, skipping a project Pi does not trust. Returns a
`ConfigMigration`, `{ migrated, warnings }`: the paths rewritten, and one
warning per failed write,
`Could not migrate configuration at <path>: <message>. Left the file unchanged.`
The old names are still read, so the session keeps the values either way.

### `type ConfigOutcome`

What `load` found, immutable:

- `files`: each scope's `ConfigFile`.
- `withMigrations(...migrations)` and `withValueWarnings(warnings)`: a copy with
  the extension's migrations or invalid-value warnings added after the ones
  already there. `migrated`, `migrationWarnings`, and `valueWarnings` list them.
- `notify(ctx, extras?)`: shows what a session start found. When anything
  migrated, one info message names every file,
  `<extensionName> migrated its configuration to <path>.`, with two paths joined
  by `and` and more as `a, b, and c`. Then one warning notification, through
  `notifyWarnings`, lists migration warnings, file warnings (User before
  Project), value warnings, and `extras`. Shows nothing when both are empty.
- `warnings`: the warnings `notify` shows, without `extras`, for a report
  without a `Config:` block.
- `statusLines`: the `Config:` block of a status report, User before Project,
  each scope's state on its label row and its path on the next line, aligned
  under the state. Pass it to `formatReport` as `config`.
- `statusWarnings`: migration warnings, then value warnings, for the report's
  `Warnings:` block; file problems show in `statusLines` instead.

```text
Config:
  User:    loaded
           /Users/me/.pi/agent/theme-sync/config.json
  Project: skipped (untrusted)
           /repo/.pi/theme-sync/config.json
```

```ts
const layout = await migrateConfigLayout(ctx);
const keys = await THEME_SYNC_CONFIG.migrateKeys(ctx);
const outcome = (await THEME_SYNC_CONFIG.load(ctx))
  .withValueWarnings(invalidValueWarnings)
  .withMigrations(layout, keys);

outcome.notify(ctx, runtimeWarnings);
```

### `configScopeLabel(scope: ConfigScope): "Project" | "User"`

The label users see for a scope, as Pi writes it.

## TUI API

The primitives behind the family's overlays. Every width is in visual columns,
so styling and wide characters never push a border out of line, and every line
they return fits the width it was given. The rules they implement are in the
repository's `docs/tui.md`.

### `overlayOptions(size: OverlaySize): OverlayOptions`

Returns the `overlayOptions` for `ctx.ui.custom`. Both sizes are centered with a
margin of 1 and at most 80% of the terminal height. `"main"` (a picker, browser,
editor, or config form) is 80% wide and at least 60 columns; `"nested"` (a
confirmation, info text, or sub-selector opened from a main surface) is 50% wide
and at least 48 columns. Spread the result to add options such as `visible`.

### `overlayMaxHeight(terminalRows: number): number`

Returns the rows Pi gives an overlay of either size: 80% of the terminal height
rounded down, no more than the rows inside the margins, and at least 1. Lay the
surface out to this height and scroll anything taller, because Pi keeps only the
top rows of a taller render.

### `getLiveTui(ctx: LiveTuiContext, key: string): LiveTui | undefined`

Returns `{ tui, theme }`, Pi's live TUI and the theme it renders with, for work
`ctx.ui` does not cover, such as a passive overlay pushed with `showOverlay` or
Pi's terminal color-scheme API. Pi hands the TUI only to component factories, so
the helper adds a zero-line widget under `key` (`<slug>:<thing>`), keeps what
its factory receives, and removes the widget before returning. Nothing is drawn
and keyboard focus never moves.

It returns `undefined` outside the interactive terminal UI, when `setWidget`
throws, or when Pi does not call the factory. It relies on Pi calling a widget
factory synchronously inside `setWidget`. Get the TUI once per session start and
don't keep it across sessions.

```ts
import { getLiveTui } from "@sherif-fanous/pi-extensions-core";

const live = getLiveTui(ctx, "notification-center:bridge");

if (live) {
  const handle = live.tui.showOverlay(new ToastStack(live.theme), {
    nonCapturing: true,
  });
}
```

### `layoutFramedSurface(options: FramedSurfaceOptions): FramedSurfaceLayout`

Lays out a framed surface whose body is scrolled text, such as a dialog, a
confirmation, or a form, in the height Pi gives an overlay, and returns
`{ lines, scrollOffset, bodyRows }`. The options are:

- `title`, `titleRight?`, `theme`, and `width`, as for `renderFrame`;
- `terminalRows`: Pi's terminal height, `tui.terminal.rows`, which
  `overlayMaxHeight` turns into the surface's height;
- `body`: styled rows fitted to `frameBodyWidth(width)`;
- `scrollOffset`: the body rows scrolled past, as the last layout returned it;
- `hints`: the footer's key hints while the body fits;
- `overflowHints?`: the footer's key hints while the body does not fit, such as
  `hints` with `↑/↓ Scroll` and `PgUp/PgDn Page` added. Defaults to `hints`;
- `busy?`: a busy line such as `Saving…`, drawn in place of either;
- `pinned?`: styled rows drawn under the body and never scrolled, such as a
  form's buttons;
- `reveal?`: `{ start, end }`, body rows to keep in view, such as the focused
  field. The offset moves as little as it can.

The footer is wrapped with `wrapKeyHints`. The overflow hints are chosen when
the body is taller than the rows left under `hints`, and the body then gets the
rows left under them, at least one. It scrolls with `scrollLines`, so hidden
rows show as `↑` and `↓` markers. Store `scrollOffset`, clamped into range, for
the next render, and page by `bodyRows`.

```ts
import {
  frameBodyWidth,
  keyHint,
  layoutFramedSurface,
} from "@sherif-fanous/pi-extensions-core";
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

render(width: number): string[] {
  const close = keyHint(this.keybindings, "tui.select.cancel", "Close");
  const layout = layoutFramedSurface({
    body: wrapTextWithAnsi(this.text, Math.max(1, frameBodyWidth(width))),
    hints: [close],
    overflowHints: [
      keyHint(this.keybindings, ["tui.select.up", "tui.select.down"], "Scroll"),
      keyHint(this.keybindings, ["tui.select.pageUp", "tui.select.pageDown"], "Page"),
      close,
    ],
    scrollOffset: this.scrollOffset,
    terminalRows: this.terminal.rows,
    theme: this.theme,
    title: "Preset Prompt",
    width,
  });

  this.scrollOffset = layout.scrollOffset;
  this.pageRows = layout.bodyRows;

  return layout.lines;
}
```

A surface whose body depends on its row count, such as a list window, draws with
`renderFrame` and `frameBodyRows` instead.

### `renderFrame(options: FrameOptions): string[]`

Draws a whole frame from `{ title, titleRight?, body, footer, theme, width }`:

```text
┌─ Presets Plus ────── (3/12) ─┐
│ First row                    │
│ Second row                   │
├──────────────────────────────┤
│ ↑/↓ Move · Enter Select      │
│ Esc Close                    │
└──────────────────────────────┘
```

The title is plain text, drawn bold in the accent color. `titleRight` keeps its
styling and is dropped when the border cannot hold it with the whole title.
`body` rows are already styled and are padded by one space on each side.
`footer` holds plain lines drawn dim: the lines `wrapKeyHints` returns, or one
busy line such as `Saving…`. An empty footer draws no rule. Borders take the
theme's `border` color. The result has `body.length + footer.length + 3` lines,
each exactly `width` columns wide.

### `frameBodyWidth(width: number): number`

### `frameBodyRows(height: number, footerLineCount: number): number`

Return the columns a body row has inside a frame `width` wide, and the body rows
that fit in a frame `height` rows tall with `footerLineCount` footer lines. Wrap
the footer first, since its line count decides the body rows.

```ts
import {
  frameBodyRows,
  frameBodyWidth,
  keyHint,
  listWindow,
  overlayMaxHeight,
  renderFrame,
  wrapKeyHints,
} from "@sherif-fanous/pi-extensions-core";

render(width: number): string[] {
  const footer = wrapKeyHints(
    [
      keyHint(this.keybindings, ["tui.select.up", "tui.select.down"], "Move"),
      keyHint(this.keybindings, "tui.select.confirm", "Select"),
      keyHint(this.keybindings, "tui.select.cancel", "Close"),
    ],
    frameBodyWidth(width),
  );
  const rows = frameBodyRows(overlayMaxHeight(this.tui.terminal.rows), footer.length);
  const window = listWindow(this.selected, this.items.length, rows);

  return renderFrame({
    body: this.items.slice(window.start, window.end).map(this.renderRow),
    footer,
    theme: this.theme,
    title: "Presets Plus",
    titleRight: window.position && this.theme.fg("muted", window.position),
    width,
  });
}
```

### `frameTop(title: string, width: number, theme: FrameTheme, titleRight?: string): string`

### `frameLine(content: string, width: number, theme: Pick<Theme, "fg">): string`

### `frameSegment(left: string, right: string, width: number, theme: Pick<Theme, "fg">): string`

The pieces `renderFrame` is made of, for layouts it does not cover, such as
split panes or toast cards. `frameTop` draws the titled top border. `frameLine`
fits `content` between two borders with no padding of its own. `frameSegment`
draws a horizontal border such as `├────┤`. Each returns exactly `width` columns
and degrades to fewer border characters at widths below 3.

### `padToWidth(text: string, width: number, fill?: string, ellipsis?: string): string`

Truncates `text` to `width` columns with `ellipsis` (default `…`), then pads it
with `fill` (default a space). A width of zero or less returns an empty string.

### `keyHint(keybindings, keybinding: Keybinding | readonly Keybinding[], action: string): string | undefined`

Returns one footer hint: the first key bound to each keybinding, joined with
`/`, then the Title Case action, such as `↑/↓ Move` or `Esc Close`. A remap
replaces Pi's default keys, so the hint names the key the user actually has.
Unbound keybindings are left out, and the hint is `undefined` when none is
bound. Write keys with no keybinding id literally: `F1 Help`, `/ Filter`,
`n New`.

### `keyText(keybindings, keybinding: Keybinding): string | undefined`

Returns the first key bound to `keybinding`, spelled by `formatKeyId`, or
`undefined` when none is bound.

### `formatKeyId(key: KeyId): string`

Spells a Pi key id the way hints show it: `↑ ↓ ← →`, `Esc`, `Enter`, `Tab`,
`Space`, `PgUp`, `PgDn`, `F1`, and chords such as `Ctrl+S` or `Shift+Tab`. A
bare printable key stays as typed (`n`, `/`).

### `wrapKeyHints(hints: readonly (string | undefined)[], width: number): string[]`

Joins hints with a spaced middle dot (`↑/↓ Move · Esc Close`) on as many lines
of `width` columns as they need, breaking only between two hints, so no hint is
cut. Skips `undefined` and empty hints. Only a single hint wider than a whole
line is truncated with `…`.

### `matchSelectAction(keybindings, data: string): SelectAction | undefined`

Returns the list action `data` triggers under the user's Pi keybindings: `"up"`,
`"down"`, `"pageUp"`, `"pageDown"`, `"confirm"`, or `"cancel"`
(`tui.select.<action>`), checked in that order, or `undefined`. Only the bound
keys match, so a remap replaces the defaults. Cancel is Esc and Ctrl+C by
default.

```ts
import {
  matchSelectAction,
  moveListSelection,
} from "@sherif-fanous/pi-extensions-core";

handleInput(data: string): void {
  const action = matchSelectAction(this.keybindings, data);

  if (action === "cancel") this.done(undefined);
  else if (action === "confirm") this.done(this.items[this.selected]);
  else if (action) {
    this.selected = moveListSelection(this.selected, this.items.length, action, this.pageSize);
  }
}
```

### `matchesHelpKey(data: string): boolean`

Returns whether `data` is an F1 press, the key every form uses for `F1 Help`.
Unlike `matchesKey(data, Key.f1)`, it also matches the Kitty keyboard protocol
encodings that terminals such as Ghostty send.

### `moveListSelection(selected: number, count: number, move: ListMove, pageSize: number): number`

Returns the index a move selects. `"up"` and `"down"` move one item and wrap
around the ends; `"pageUp"` and `"pageDown"` move `pageSize` items (at least
one) and stop at the first or last item. An empty list returns 0.

### `listWindow(selected: number, count: number, rows: number): ListWindow`

Returns `{ start, end, position }`: the visible items from `start` up to the
exclusive `end`, keeping the selection centered where the ends allow, and
`position` as `(n/m)` when the list has more items than rows, else `undefined`.

### `listPosition(selected: number, count: number): string`

Returns the 1-based position `(3/12)`, for lists that window themselves.

### `scrollLines(lines: readonly string[], rows: number, offset: number, width: number, theme: Pick<Theme, "fg">): ScrolledLines`

Returns `{ lines, offset }`: `rows` lines from `offset`, with the offset clamped
into range and every row fitted to `width`. When lines are hidden above or
below, the first or last row ends in a dim `↑` or `↓` (`↕` on a lone row). Store
the returned offset for the next render.

### `emptyStateLines(message: string, width: number, theme: Pick<Theme, "fg">): string[]`

Returns an empty or no-match state as muted rows wrapped to `width`. Write the
message as a sentence that says what is empty, then the next step when there is
one: `No presets yet. Press n to create one.`

## License

[MIT](LICENSE)
