# pi-extensions-testing

Test doubles for the Pi extensions in
[pi-extensions](https://github.com/sherif-fanous/pi-extensions): fakes for Pi's
TUI, keybindings, widgets, themes, and `ctx.ui.custom`, plus temporary config
directories and checks for rendered lines and shown text.

This package is private. It is never published, and the workspace's packages use
it only as a dev dependency.

## Requirements

- `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`, as peer
  dependencies

Nothing here imports a test runner, so every package can use these helpers
whatever its Vitest version. Wrap a fake in `vi.fn()` to assert on its calls.

## Install

Add it to a workspace package's `devDependencies`:

```json
{
  "devDependencies": {
    "@sherif-fanous/pi-extensions-testing": "workspace:*"
  }
}
```

## Usage

```ts
import {
  createPlainTheme,
  findOverflowingLines,
} from "@sherif-fanous/pi-extensions-testing";

const lines = new StatusView(createPlainTheme()).render(40);

expect(findOverflowingLines(lines, 40)).toEqual([]);
```

## API

### Async

- `createDeferred()` returns a promise that the test settles explicitly.
- `flushPromises()` waits until pending continuations have run.

### Config

- `createTempConfigDirs()` creates temporary agent and project directories for
  one test. Call `cleanup` in `afterEach`.
- `createProjectTrustContext(cwd, trusted)` returns a context whose
  `isProjectTrusted()` returns `trusted`.

### TUI

- `createFakeTui(columns?, rows?)` records overlays, renders, and focus changes.
- `createFakeWidgets(tui)` exposes `setWidget` overlays through `tui.overlays`.
- `createFakeCustom(options)` drives `ctx.ui.custom`: it resolves with the value
  the component passes to `done`, then disposes the component.
- `createFakeKeybindings(keys?)` matches input against `keys` and reports Pi's
  default keys in hints.
- `createPiKeybindings(userBindings?)` returns Pi's real keybindings manager
  with `userBindings` applied, to test remapped keys.
- `createPlainTheme()` applies no styling, so lines stay exactly measurable.
- `createMarkerTheme()` marks each styled span, to assert which color it got.

### Checks

- `findOverflowingLines(lines, width)` returns every line wider than `width`
  visual columns. Expect it to return `[]`.
- `stripAnsi(text)` removes color and style sequences.
- `createShownTextRecorder(options?)` records the text a command shows through
  the fakes.
- `findShownTextViolations(shown, { displayName, slug })` checks recorded text
  against the family text standard in the repository's `docs/text.md`. Expect it
  to return `[]`.

## License

MIT
