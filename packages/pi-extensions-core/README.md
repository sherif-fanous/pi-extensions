# pi-extensions-core

A [Pi](https://github.com/earendil-works/pi) extension library that provides
shared helpers for errors, config files, reports, and TUI surfaces.

The extensions in
[pi-extensions](https://github.com/sherif-fanous/pi-extensions) depend on it.
Every export is stateless. Each installed extension may load its own copy of
this package, so nothing here keeps module-level state.

## Requirements

- Pi 0.80.4 or newer

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

### `parseJsonObject(text: string): ParseJsonObjectResult`

Parses JSON text whose top level must be an object, without throwing. Returns
`{ ok: true, value }` for an object,
`{ ok: false, reason: "invalid-json", error }` with the error `JSON.parse`
threw, or `{ ok: false, reason: "not-object" }` for `null`, an array, or a
primitive, so callers can word a warning for each.

```ts
import {
  malformedConfigWarning,
  parseJsonObject,
} from "@sherif-fanous/pi-extensions-core";

const parsed = parseJsonObject(text);
if (!parsed.ok) return { warnings: [malformedConfigWarning(path, parsed)] };
```

### `unreadableConfigWarning(path: string, error: unknown): string`

### `malformedConfigWarning(path: string, failure): string`

Return the standard warnings for a configuration file an extension ignores.
`unreadableConfigWarning` covers a file that exists but could not be read (treat
a missing file as absent, not as a warning):

```text
Could not read configuration at <path>: <message>. Ignored the file.
```

`malformedConfigWarning` takes a failed `parseJsonObject` result:

```text
Configuration at <path> is not valid JSON: <message>. Ignored the file.
Configuration at <path> must be a JSON object. Ignored the file.
```

`<message>` is the `describeError` text followed by a full stop, unless it
already ends in `.`, `!`, or `?`, so the warning never shows `..`.

```ts
import {
  isNotFoundError,
  unreadableConfigWarning,
} from "@sherif-fanous/pi-extensions-core";

try {
  text = await readFile(path, "utf8");
} catch (error) {
  if (isNotFoundError(error)) return { warnings: [] };
  return { warnings: [unreadableConfigWarning(path, error)] };
}
```

### `atomicWrite(target: string, contents: string, fs?: AtomicWriteFs): Promise<void>`

Writes `contents` to a temporary file beside `target`, syncs it, and renames it
over `target`, creating missing parent directories first. Readers see either the
previous file or the new one, never a partial write. On failure the call
rejects, `target` keeps its previous contents, and the temporary file is
removed. Tests can pass an `AtomicWriteFs` stub to simulate failures.

### `writeJsonFile(path: string, value: unknown, fs?: AtomicWriteFs): Promise<void>`

Writes `value` atomically as JSON indented by two spaces and ending in a
newline.

```ts
import { writeJsonFile } from "@sherif-fanous/pi-extensions-core";

await writeJsonFile(configPath, { version: 2, presets });
```

### `extensionConfigPath({ extension, file, agentDir? }): string`

Returns `<agentDir>/<extension>/<file>`. `agentDir` defaults to Pi's
`getAgentDir()`, which honors the agent directory override.

### `projectConfigPath({ cwd, extension, file }): string`

Returns `<cwd>/.pi/<extension>/<file>`, using Pi's `CONFIG_DIR_NAME` for the
`.pi` segment.

```ts
import {
  extensionConfigPath,
  projectConfigPath,
} from "@sherif-fanous/pi-extensions-core";

const userPath = extensionConfigPath({
  extension: "theme-sync",
  file: "settings.json",
});
const projectPath = projectConfigPath({
  cwd: ctx.cwd,
  extension: "theme-sync",
  file: "settings.json",
});
```

Use these for files other than the configuration itself, such as an old layout a
migration reads. `configFilePath` locates `config.json`.

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
  alignLabelRows,
  createCommandReport,
} from "@sherif-fanous/pi-extensions-core";

const statusReport = createCommandReport("theme-sync:status-report");

export default function (pi: ExtensionAPI) {
  statusReport.register(pi);
  pi.registerCommand("theme-sync", {
    handler: async (_args, ctx) => {
      const body = [
        "Theme Sync Status",
        ...alignLabelRows([
          ["Appearance:", "dark"],
          ["Applied theme:", "solarized-dark"],
        ]),
      ].join("\n");

      statusReport.deliver(ctx, pi, { body });
    },
  });
}
```

### `styleReport(body: string, theme: Pick<Theme, "bold" | "fg">): string`

Styles a plain report body line by line. The first line is the heading, in bold
accent. A `Warnings:` line and every line after it are warning-colored. On any
other line, the text up to and including the first colon is a muted label.
Remaining lines are unchanged. `createCommandReport` applies these rules; call
`styleReport` directly to show a report on another surface, such as a dialog.

### `alignLabelRows(rows: readonly (readonly [label: string, value: string])[]): string[]`

Turns `[label, value]` pairs into lines of the form `  <label> <value>`, with
every label padded to the longest one so the values line up.

### `guardCommand(extensionName: string, handler): handler`

Wraps a command handler. When the handler throws or rejects, the wrapper
notifies `<extensionName> command failed: <message>` at error severity instead
of letting Pi show its generic extension error row, and never rethrows.
`<message>` is the `describeError` text with a full stop added unless it already
ends in `.`, `!`, or `?`.

### `guardEvent(extensionName: string, eventName: string, handler): handler`

Wraps a `pi.on` handler. A successful handler's result, such as a
`before_agent_start` system prompt, passes through unchanged. When the handler
throws or rejects, the wrapper notifies
`<extensionName> <eventName> failed: <message>` at error severity and resolves
to `undefined`. Passed to `pi.on`, the wrapper takes its event, context, and
result types from the matching overload.

```ts
import { guardCommand, guardEvent } from "@sherif-fanous/pi-extensions-core";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("theme-sync", {
    handler: guardCommand("Theme Sync", (args, ctx) =>
      runThemeSyncCommand(args, ctx),
    ),
  });
  pi.on(
    "session_start",
    guardEvent("Theme Sync", "session_start", (_event, ctx) =>
      startMonitoring(ctx),
    ),
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
in the repository's `AGENTS.md` "Config" section.

### `type ConfigScope = "project" | "user"`

### `configScopeLabel(scope: ConfigScope): "Project" | "User"`

The two places a configuration file lives, and the label users see for each, as
Pi writes them.

### `configFilePath(scope: ConfigScope, { cwd, extension, agentDir? }): string`

Returns `<agentDir>/<extension>/config.json` for `"user"` and
`<cwd>/.pi/<extension>/config.json` for `"project"`. `agentDir` defaults to Pi's
`getAgentDir()`.

### `loadConfigFiles(ctx, options): Promise<Record<S, ConfigFile>>`

Reads the extension's `config.json` in each scope of `options.scopes` and
returns one `ConfigFile` per scope. `ctx` needs `cwd` and `isProjectTrusted()`
(Pi 0.79.1 or newer), which is consulted only when the project scope is read.
The options are:

- `extension`: the slug, which names the configuration directory.
- `scopes`: the scopes the extension has, such as `["user", "project"]` or
  `["user"]`.
- `version`: the `version` this release reads and writes.
- `renamedKeys?`: `ConfigKeyRename[]`, keys read under an old name while the new
  name is absent.
- `agentDir?` and `fs?` (`ConfigFileFs`: `access` and `readFile`), for tests.

Each `ConfigFile` has `scope`, `path`, and a `state`:

- `"loaded"`: the file is a JSON object whose `version` is absent (meaning the
  current one) or equal to `version`. `data` holds it with renamed keys moved to
  their new names, and `renamedKeys` lists the old names found, so a non-empty
  list means the file still needs migrating.
- `"missing"`: no file. Use the defaults and say nothing.
- `"invalid"`: unreadable, not valid JSON, not an object, or another `version`.
  `reason` is a short phrase for the status block (`not valid JSON: …`,
  `not a JSON object`, `unreadable: …`, `unsupported version 3`); `warning` is
  the sentence to show once.
- `"untrusted"`: a project file exists, but Pi does not trust the project, so it
  was not read. `warning` reads
  `Skipped project configuration at <path> because the project is not trusted. Trust the project to use it.`
  An untrusted project without the file is `"missing"`, so it stays silent.

It never throws for a file problem.

```ts
import {
  configFileWarnings,
  loadConfigFiles,
  notifyWarnings,
} from "@sherif-fanous/pi-extensions-core";

const files = await loadConfigFiles(ctx, {
  extension: "theme-sync",
  renamedKeys: [{ from: "isSyncActive", to: "syncEnabled" }],
  scopes: ["user", "project"],
  version: 2,
});
const project = files.project.state === "loaded" ? files.project.data : {};

notifyWarnings(ctx, "Theme Sync", configFileWarnings(Object.values(files)));
```

### `readConfigFile(options: ReadConfigFileOptions): Promise<ConfigFile>`

Reads one file: `{ scope, path, trusted, version, renamedKeys?, fs? }`, where
`trusted` is `ctx.isProjectTrusted()` and only a project file consults it. Use
it when an extension reads one scope at a time.

### `configFileWarnings(files: readonly ConfigFile[]): string[]`

Returns the `warning` of every `invalid` and `untrusted` file, in order.

### `updateConfigFile(options, update): Promise<void>`

Reads the file again with the `readConfigFile` options, passes its data (with
renamed keys moved, or `{}` when missing) to `update`, and writes the result
with the current `version` first. Throws, leaving the file untouched, when the
scope is a project Pi does not trust
(`The project is not trusted, so <path> was not saved. Trust the project and try again.`),
when the file is invalid
(`<path> is invalid (<reason>). Fix the file and try again.`), so a malformed
file or one from a newer release is never overwritten, or when the write fails.
Pass `atomicWriteFs` to simulate write failures.

```ts
import {
  describeErrorSentence,
  updateConfigFile,
} from "@sherif-fanous/pi-extensions-core";

try {
  await updateConfigFile(
    { path, scope, trusted: ctx.isProjectTrusted(), version: 2 },
    (data) => ({ ...data, syncEnabled: false }),
  );
} catch (error) {
  this.message = `Could not save the configuration: ${describeErrorSentence(error)}`;
}
```

### `writeConfigFile(path: string, document: Record<string, unknown>, version: number, fs?: AtomicWriteFs): Promise<void>`

Writes `document` atomically with `version` as its first key, replacing any
`version` it holds. Use it for migrations; saves go through `updateConfigFile`.

### `renameConfigKeys(document, renames: readonly ConfigKeyRename[]): RenamedConfigKeys`

Returns `{ document, renamed }`: a copy with each `{ from, to }` rename applied,
where both are dot-separated paths such as `toast.timeout`, and the `from` paths
applied. When only the old key is present, its value moves to the new path,
creating objects on the way. When both are present, the new key wins and the old
one is dropped. A rename is skipped when the old key is absent or a value on the
way to the new path is not an object. `loadConfigFiles` applies it for you.

### `migrateRenamedConfigKeys(files: readonly ConfigFile[], version: number, fs?: AtomicWriteFs): Promise<ConfigKeyMigration>`

Rewrites every loaded file whose `renamedKeys` is not empty with its data, which
already has the new names, stamped with `version`. Returns
`{ migrated, warnings }`: the paths rewritten, and one warning per failed write,
`Could not migrate configuration at <path>: <message>. Left the file unchanged.`

### `configMigratedMessage(extensionName: string, paths: readonly [string, ...string[]]): string`

Returns the one info message for everything a session start migrated:
`<extensionName> migrated its configuration to <path>.`, with two paths joined
by `and` and more as `a, b, and c`.

```ts
import {
  configMigratedMessage,
  migrateRenamedConfigKeys,
} from "@sherif-fanous/pi-extensions-core";

const { migrated, warnings } = await migrateRenamedConfigKeys(
  Object.values(files),
  2,
);
const [first, ...rest] = [...movedLayouts, ...migrated];

if (first)
  ctx.ui.notify(configMigratedMessage("Theme Sync", [first, ...rest]), "info");
```

### `configStatusLines(files: readonly ConfigFile[]): string[]`

Returns the `Config:` block of a status report: User before Project, each
scope's state on its label row and its path on the next line, aligned under the
state. States read `loaded`, `not found`, `invalid: <reason>`, and
`skipped (untrusted)`. Put it after the report's main rows and a blank line, and
before `Warnings:`.

```text
Config:
  User:    loaded
           /Users/me/.pi/agent/theme-sync/config.json
  Project: skipped (untrusted)
           /repo/.pi/theme-sync/config.json
```

### `untrustedProjectConfigWarning(path: string): string`

### `unsupportedConfigVersionWarning(path: string, found: unknown, supported: number): string`

The warnings `loadConfigFiles` gives an `untrusted` and a wrong-version file:

```text
Skipped project configuration at <path> because the project is not trusted. Trust the project to use it.
Configuration at <path> has version 3, but only version 2 is supported. Ignored the file.
```

## TUI API

The primitives behind the family's overlays. Every width is in visual columns,
so styling and wide characters never push a border out of line, and every line
they return fits the width it was given. The rules they implement are in the
repository's `AGENTS.md` "TUI" section.

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
