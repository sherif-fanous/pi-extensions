import { promises as fs } from "node:fs";

import { openThemeSyncOverlay } from "../src/command.js";
import { writeConfigChanges } from "../src/config.js";
import { createThemeSyncRuntime } from "../src/runtime.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  createDeferred,
  createFakeCustom,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, expect, test, vi } from "vitest";

type SaveResult = Awaited<ReturnType<typeof writeConfigChanges>>;

vi.mock("../src/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config.js")>()),
  writeConfigChanges: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

test.each(["success", "refusal", "rejection"] as const)(
  "blocks input during save and restores it after %s",
  async (outcome) => {
    let finishSave = () => {};
    const pendingSave = new Promise<SaveResult>((resolve, reject) => {
      finishSave = () => {
        if (outcome === "rejection") {
          reject(new Error("expected write failure"));
        } else if (outcome === "refusal") {
          resolve({ ok: false, reason: "Fix the config file and try again." });
        } else {
          resolve({ ok: true });
        }
      };
    });
    const write = vi
      .mocked(writeConfigChanges)
      .mockReturnValueOnce(pendingSave)
      .mockResolvedValue({ ok: true });
    const overlay = await startOverlay();

    try {
      await overlay.input("\r", "\x1b[B", "\r", "\x13", "\r");

      expect(write).toHaveBeenCalledExactlyOnceWith(
        "project",
        "/unused-overlay-save-test",
        { "themes.light": "dark" },
      );

      await overlay.input(
        "\r",
        "\x1b[A",
        "\r",
        "\x13",
        "\r",
        "\x12",
        "\x03",
        "\x1b",
      );

      expect(write).toHaveBeenCalledOnce();
      expect(overlay.reload).not.toHaveBeenCalled();
      expect(overlay.done).not.toHaveBeenCalled();

      finishSave();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await overlay.input("\x13", "\r");

      expect(write).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenLastCalledWith(
        "project",
        "/unused-overlay-save-test",
        outcome === "success" ? {} : { "themes.light": "dark" },
      );

      await new Promise<void>((resolve) => setImmediate(resolve));
      await overlay.input("\x03");
      await overlay.closed;

      expect(overlay.done).toHaveBeenCalledOnce();
      expect(overlay.reload).not.toHaveBeenCalled();
    } finally {
      finishSave();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await overlay.input("\x03");
      await overlay.closed;
    }
  },
);

async function startOverlay() {
  vi.spyOn(fs, "readFile").mockRejectedValue(
    Object.assign(new Error("Missing test config"), { code: "ENOENT" }),
  );

  let acceptInput: (data: string) => void = () => {};
  const ready = createDeferred();
  const done = vi.fn();
  const reload = vi.fn();
  const custom = createFakeCustom({
    onDone: done,
    onMount: (overlay) => {
      acceptInput = (data) => overlay.handleInput?.(data);
      ready.resolve();
    },
  });
  const ctx = {
    cwd: "/unused-overlay-save-test",
    hasUI: true,
    mode: "tui",
    reload,
    ui: {
      custom,
      getAllThemes: () => [{ name: "light" }, { name: "dark" }],
      notify: vi.fn(),
    },
  } as unknown as ExtensionCommandContext;
  const closed = openThemeSyncOverlay(createThemeSyncRuntime(), ctx);

  await ready.promise;

  return {
    closed,
    done,
    input: async (...events: string[]) => {
      for (const data of events) {
        acceptInput(data);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    },
    reload,
  };
}
