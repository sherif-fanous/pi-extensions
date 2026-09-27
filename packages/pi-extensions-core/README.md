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

ctx.ui.notify(`Could not load presets: ${describeError(err)}.`, "error");
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
  describeError,
  parseJsonObject,
} from "@sherif-fanous/pi-extensions-core";

const parsed = parseJsonObject(text);
if (!parsed.ok) {
  return parsed.reason === "invalid-json"
    ? `${path} contains invalid JSON: ${describeError(parsed.error)}.`
    : `${path} must contain a JSON object.`;
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

## License

MIT
