import { openThemeSyncOverlay } from "../src/command.js";
import { createThemeSyncRuntime } from "../src/runtime.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  createDeferred,
  createFakeCustom,
  createPiKeybindings,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

test("closes the overlay before reloading and waits for reload completion", async () => {
  const pendingReload = createDeferred();
  const reload = vi.fn().mockReturnValue(pendingReload.promise);
  const ctx = createContext(["\x12"], reload);
  let completed = false;
  const command = openThemeSyncOverlay(createThemeSyncRuntime(), ctx).then(
    () => {
      completed = true;
    },
  );

  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

  expect(completed).toBe(false);
  pendingReload.resolve();
  await command;

  expect(completed).toBe(true);
});

test("reports a failed reload as Could not reload Pi", async () => {
  const reload = vi
    .fn()
    .mockRejectedValue(new Error("expected reload failure"));
  const notify = vi.fn();
  const ctx = createContext(["\x12"], reload, notify);

  await openThemeSyncOverlay(createThemeSyncRuntime(), ctx);

  expect(reload).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledExactlyOnceWith(
    "Could not reload Pi: expected reload failure.",
    "error",
  );
});

test.each([
  { name: "Escape from config", input: ["\x1b"] },
  { name: "Ctrl+C from config", input: ["\x03"] },
])("$name closes without reloading", async ({ input }) => {
  const reload = vi.fn();
  const ctx = createContext(input, reload);

  await openThemeSyncOverlay(createThemeSyncRuntime(), ctx);

  expect(reload).not.toHaveBeenCalled();
});

function createContext(
  input: string[],
  reload: ExtensionCommandContext["reload"],
  notify = vi.fn(),
): ExtensionCommandContext {
  const done = vi.fn();
  const custom = createFakeCustom({
    keybindings: createPiKeybindings(),
    keys: input,
    onDone: done,
    onMount: () => {
      expect(done).toHaveBeenCalledOnce();
      expect(reload).not.toHaveBeenCalled();
    },
  });

  return {
    cwd: "/unused-overlay-reload-test",
    hasUI: true,
    isProjectTrusted: () => true,
    mode: "tui",
    reload,
    ui: { custom, getAllThemes: () => [], notify },
  } as unknown as ExtensionCommandContext;
}
