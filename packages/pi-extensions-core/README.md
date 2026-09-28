# pi-extensions-core

Shared runtime helpers for the
[pi-extensions](https://github.com/sherif-fanous/pi-extensions) packages.

Every export is stateless. Each installed extension may load its own copy of
this package, so nothing here keeps module-level state.

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

const globalPath = extensionConfigPath({
  extension: "theme-sync",
  file: "settings.json",
});
const projectPath = projectConfigPath({
  cwd: ctx.cwd,
  extension: "theme-sync",
  file: "settings.json",
});
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

## License

MIT
