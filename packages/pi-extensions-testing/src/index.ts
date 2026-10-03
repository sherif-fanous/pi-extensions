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
} from "./fakes/config.js";
export {
  createFakeCustom,
  type CustomComponent,
  type FakeCustomOptions,
} from "./fakes/custom.js";
export {
  createFakePi,
  type FakeCommand,
  type FakeEntry,
  type FakeEventHandler,
  type FakeFlag,
  type FakePi,
  type FakePiOverrides,
  type FakeShortcut,
  type FakeTool,
} from "./fakes/extension-api.js";
export {
  createFakeContext,
  createFakeToolContext,
  type FakeContextOptions,
  type FakeSessionManager,
} from "./fakes/extension-context.js";
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
} from "./fakes/tui.js";
