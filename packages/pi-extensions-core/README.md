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

## License

MIT
