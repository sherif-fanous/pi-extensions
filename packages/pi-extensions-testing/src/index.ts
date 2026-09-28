/**
 * Test doubles for Pi extensions.
 *
 * Nothing here imports a test runner, so every package can use these
 * helpers whatever its Vitest version. Wrap a fake in `vi.fn()` to assert
 * on its calls.
 */

export { createDeferred, type Deferred, flushPromises } from "./async.js";
export {
  createProjectTrustContext,
  createTempConfigDirs,
  type ProjectTrustContext,
  type TempConfigDirs,
} from "./config.js";
export {
  createFakeCustom,
  type CustomComponent,
  type FakeCustomOptions,
} from "./custom.js";
export {
  findOverflowingLines,
  type OverflowingLine,
  stripAnsi,
} from "./lines.js";
export {
  createShownTextRecorder,
  findShownTextViolations,
  type RecordableCommand,
  type RecordedKey,
  type RecordedKeyKind,
  type ShownSurface,
  type ShownText,
  type ShownTextRecorder,
  type ShownTextStandard,
} from "./shown-text.js";
export {
  createFakeKeybindings,
  createFakeTui,
  createFakeWidgets,
  createMarkerTheme,
  createPiKeybindings,
  createPlainTheme,
  type FakeOverlay,
  type FakeTui,
  type FakeWidgets,
} from "./tui.js";
