/**
 * Test doubles for Pi extensions.
 *
 * Nothing here imports a test runner, so every package can use these
 * helpers whatever its Vitest version. Wrap a fake in `vi.fn()` to assert
 * on its calls.
 */

export { createDeferred, type Deferred, flushPromises } from "./async.js";
export {
  createFakeCustom,
  type CustomComponent,
  type FakeCustomOptions,
} from "./custom.js";
export {
  createFakeKeybindings,
  createFakeTui,
  createFakeWidgets,
  createMarkerTheme,
  createPlainTheme,
  type FakeOverlay,
  type FakeTui,
  type FakeWidgets,
} from "./tui.js";
