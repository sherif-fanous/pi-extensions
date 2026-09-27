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

## License

MIT
