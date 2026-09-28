import { openThemeSyncOverlay } from "../../src/commands/theme-sync.js";
import { writeConfigChanges } from "../../src/config/save.js";
import {
  createDeferred,
  createFakeContext,
  createFakeCustom,
  createPiKeybindings,
  flushPromises,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("../../src/config/save.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/config/save.js")>()),
  writeConfigChanges: vi.fn(),
}));

const cwd = "/unused-overlay-save-test";

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

test.each(["success", "failure"] as const)(
  "blocks input during save and restores it after %s",
  async (outcome) => {
    let finishSave = () => {};
    const pendingSave = new Promise<void>((resolve, reject) => {
      finishSave = () => {
        if (outcome === "failure") {
          reject(new Error("expected write failure"));
        } else {
          resolve();
        }
      };
    });
    const write = vi
      .mocked(writeConfigChanges)
      .mockReturnValueOnce(pendingSave)
      .mockResolvedValue();
    const overlay = await startOverlay();

    try {
      await overlay.input("\r", "\x1b[B", "\r", "\x13", "\r");

      expect(write).toHaveBeenCalledExactlyOnceWith(
        "project",
        expect.objectContaining({ cwd }),
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
      await flushPromises();
      await overlay.input("\x13", "\r");

      expect(write).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenLastCalledWith(
        "project",
        expect.objectContaining({ cwd }),
        outcome === "success" ? {} : { "themes.light": "dark" },
      );

      await flushPromises();
      await overlay.input("\x03");
      await overlay.closed;

      expect(overlay.done).toHaveBeenCalledOnce();
      expect(overlay.reload).not.toHaveBeenCalled();
    } finally {
      finishSave();
      await flushPromises();
      await overlay.input("\x03");
      await overlay.closed;
    }
  },
);

async function startOverlay() {
  let acceptInput: (data: string) => void = () => {};
  const ready = createDeferred();
  const done = vi.fn();
  const reload = vi.fn();
  const custom = createFakeCustom({
    keybindings: createPiKeybindings(),
    onDone: done,
    onMount: (overlay) => {
      acceptInput = (data) => overlay.handleInput?.(data);
      ready.resolve();
    },
  });
  const ctx = createFakeContext({
    cwd,
    reload,
    ui: {
      custom,
      getAllThemes: () => [
        { name: "light", path: undefined },
        { name: "dark", path: undefined },
      ],
      notify: vi.fn(),
    },
  });
  const closed = openThemeSyncOverlay(ctx);

  await ready.promise;

  return {
    closed,
    done,
    input: async (...events: string[]) => {
      for (const data of events) {
        acceptInput(data);
        await flushPromises();
      }
    },
    reload,
  };
}
