import { promises as fs } from "node:fs";

import { openThemeSyncOverlay } from "../src/command.js";
import { getTuiHandle } from "../src/detectors/pi/tui-handle.js";
import { queryWithTerminalListener } from "../src/detectors/terminal/query.js";
import { createThemeSyncRuntime } from "../src/runtime.js";
import type {
  ExtensionCommandContext,
  TerminalInputHandler,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

test.each(["rpc", "json", "print"] as const)(
  "%s skips terminal operations and reports the command limitation",
  async (mode) => {
    const ui = {
      custom: vi.fn(),
      notify: vi.fn(),
      onTerminalInput: vi.fn(),
      setWidget: vi.fn(),
    };
    const ctx = {
      hasUI: mode === "rpc",
      mode,
      ui,
    } as unknown as ExtensionCommandContext;
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    expect(
      await queryWithTerminalListener(ctx, "query", () => "reply"),
    ).toBeUndefined();
    expect(getTuiHandle(ctx)).toBeUndefined();
    await openThemeSyncOverlay(createThemeSyncRuntime(), ctx);

    expect(write).not.toHaveBeenCalled();
    expect(ui.onTerminalInput).not.toHaveBeenCalled();
    expect(ui.setWidget).not.toHaveBeenCalled();
    expect(ui.custom).not.toHaveBeenCalled();
    expect(ui.notify).toHaveBeenCalledWith(
      "Interactive TUI mode is required for /theme-sync.",
      "error",
    );
  },
);

test("TUI queries still receive replies and remove their listener", async () => {
  let handler: TerminalInputHandler | undefined;
  const unsubscribe = vi.fn();
  const ctx = {
    hasUI: true,
    mode: "tui",
    ui: {
      onTerminalInput: (listener: TerminalInputHandler) => {
        handler = listener;

        return unsubscribe;
      },
    },
  } as unknown as ExtensionCommandContext;
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const result = queryWithTerminalListener(ctx, "query", (data) =>
    data === "reply" ? "dark" : undefined,
  );

  expect(write).toHaveBeenCalledWith("query");
  expect(handler?.("reply")).toEqual({ consume: true });
  expect(await result).toBe("dark");
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("TUI mode still opens the custom overlay", async () => {
  vi.spyOn(fs, "readFile").mockRejectedValue(
    Object.assign(new Error("Missing test config"), { code: "ENOENT" }),
  );

  const custom = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  const ctx = {
    cwd: "/unused-mode-guard-test",
    hasUI: true,
    mode: "tui",
    ui: { custom, getAllThemes: () => [], notify },
  } as unknown as ExtensionCommandContext;

  await openThemeSyncOverlay(createThemeSyncRuntime(), ctx);

  expect(custom).toHaveBeenCalledOnce();
  expect(notify).not.toHaveBeenCalled();
});

test("TUI handle acquisition still registers and removes its widget", () => {
  const tui = {} as TUI;
  const setWidget = vi.fn(
    (_key: string, factory: ((candidate: TUI) => unknown) | undefined) => {
      if (typeof factory === "function") {
        factory(tui);
      }
    },
  );
  const ctx = {
    mode: "tui",
    ui: { setWidget },
  } as unknown as ExtensionCommandContext;

  expect(getTuiHandle(ctx)).toBe(tui);
  expect(setWidget).toHaveBeenCalledTimes(2);
  expect(setWidget).toHaveBeenLastCalledWith(
    "pi-theme-sync-tui-handle",
    undefined,
  );
});
