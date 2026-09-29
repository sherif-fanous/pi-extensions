import { openThemeSyncOverlay } from "../src/commands/theme-sync.js";
import { queryWithTerminalListener } from "../src/detectors/terminal/query.js";
import type { TerminalInputHandler } from "@earendil-works/pi-coding-agent";
import { createFakeContext } from "@sherif-fanous/pi-extensions-testing";
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
    const ctx = createFakeContext({ mode, ui });
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    expect(
      await queryWithTerminalListener(ctx, "query", () => "reply"),
    ).toBeUndefined();
    await openThemeSyncOverlay(ctx);

    expect(write).not.toHaveBeenCalled();
    expect(ui.onTerminalInput).not.toHaveBeenCalled();
    expect(ui.setWidget).not.toHaveBeenCalled();
    expect(ui.custom).not.toHaveBeenCalled();
    expect(ui.notify).toHaveBeenCalledExactlyOnceWith(
      "Theme Sync: 1 warning\n- /theme-sync needs Pi's interactive terminal UI. Run it from the TUI.",
      "warning",
    );
  },
);

test("TUI queries still receive replies and remove their listener", async () => {
  let handler: TerminalInputHandler | undefined;
  const unsubscribe = vi.fn();
  const ctx = createFakeContext({
    ui: {
      onTerminalInput: (listener) => {
        handler = listener;

        return unsubscribe;
      },
    },
  });
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
  const custom = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  const ctx = createFakeContext({
    cwd: "/unused-mode-guard-test",
    ui: { custom, notify },
  });

  await openThemeSyncOverlay(ctx);

  expect(custom).toHaveBeenCalledOnce();
  expect(notify).not.toHaveBeenCalled();
});
