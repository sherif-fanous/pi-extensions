import { promises as fs } from "node:fs";

import { openThemeSyncOverlay } from "../src/command.js";
import { createThemeSyncRuntime } from "../src/runtime.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";

type OverlayFactory = Parameters<ExtensionCommandContext["ui"]["custom"]>[0];

afterEach(() => {
  vi.restoreAllMocks();
});

test("closes the overlay before reloading and waits for reload completion", async () => {
  const pendingReload = createDeferred();
  const reload = vi.fn().mockReturnValue(pendingReload.promise);
  const ctx = createContext(["\r", "\x12"], reload);
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

test("propagates reload failure to the command caller", async () => {
  const reload = vi
    .fn()
    .mockRejectedValue(new Error("expected reload failure"));
  const ctx = createContext(["\r", "\x12"], reload);

  await expect(
    openThemeSyncOverlay(createThemeSyncRuntime(), ctx),
  ).rejects.toThrow("expected reload failure");

  expect(reload).toHaveBeenCalledOnce();
});

test.each([
  { name: "Escape from menu", input: ["\x1b"] },
  { name: "Ctrl+C from config", input: ["\r", "\x03"] },
])("$name closes without reloading", async ({ input }) => {
  const reload = vi.fn();
  const ctx = createContext(input, reload);

  await openThemeSyncOverlay(createThemeSyncRuntime(), ctx);

  expect(reload).not.toHaveBeenCalled();
});

function createContext(
  input: string[],
  reload: ExtensionCommandContext["reload"],
): ExtensionCommandContext {
  vi.spyOn(fs, "readFile").mockRejectedValue(
    Object.assign(new Error("Missing test config"), { code: "ENOENT" }),
  );

  const custom = async (factory: OverlayFactory) => {
    const closed = createDeferred();
    const done = vi.fn(() => closed.resolve());
    const overlay = await factory(
      { requestRender: vi.fn() } as unknown as Parameters<OverlayFactory>[0],
      {
        bold: (text: string) => text,
        fg: (_color: string, text: string) => text,
      } as unknown as Parameters<OverlayFactory>[1],
      {} as Parameters<OverlayFactory>[2],
      done,
    );

    for (const data of input) {
      overlay.handleInput?.(data);
    }

    expect(done).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    await closed.promise;
    overlay.dispose?.();
  };

  return {
    cwd: "/unused-overlay-reload-test",
    hasUI: true,
    mode: "tui",
    reload,
    ui: { custom, getAllThemes: () => [], notify: vi.fn() },
  } as unknown as ExtensionCommandContext;
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}
