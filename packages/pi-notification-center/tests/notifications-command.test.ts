import {
  runNotificationsCommand,
  type NotificationsCommandContext,
} from "../src/commands/notifications.js";
import { createNotificationEntry } from "../src/history.js";
import { CUSTOM_ENTRY_TYPE, type NotificationEntry } from "../src/types.js";
import { HistoryViewComponent } from "../src/ui/history-view.js";
import {
  createFakeKeybindings,
  createFakeTui,
  createPlainTheme,
} from "./helpers.js";
import type { Component } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";

const FIRST = 1_715_933_350_000;

describe("runNotificationsCommand", () => {
  it("opens a focused overlay listing the captured notifications", async () => {
    const harness = setup([
      createNotificationEntry("older", "info", FIRST),
      createNotificationEntry("newer", "error", FIRST + 1000),
    ]);

    await runNotificationsCommand(harness.ctx);

    expect(harness.component).toBeInstanceOf(HistoryViewComponent);
    expect(harness.overlay).toBe(true);
    expect(harness.notify).not.toHaveBeenCalled();

    const rendered = harness.component?.render(60).join(" ") ?? "";

    expect(rendered).toContain("newer");
    expect(rendered).toContain("older");
    expect(rendered.indexOf("newer")).toBeLessThan(rendered.indexOf("older"));
  });

  it("requests an overlay wide enough for two panes", () => {
    // Pi's default sizing is far too narrow for a split layout, so the
    // command must ask for width explicitly.
    const harness = setup([createNotificationEntry("one", "info", FIRST)]);

    return runNotificationsCommand(harness.ctx).then(() => {
      expect(harness.overlayOptions?.width).toBe("80%");
      expect(harness.overlayOptions?.minWidth).toBeGreaterThanOrEqual(60);
    });
  });

  it("opens the overlay with an empty state when nothing was captured", async () => {
    const harness = setup([]);

    await runNotificationsCommand(harness.ctx);

    expect(harness.component?.render(60).join(" ")).toContain(
      "No notifications have been captured",
    );
  });

  it("re-reads the branch on every invocation", async () => {
    const harness = setup([createNotificationEntry("branch a", "info", FIRST)]);

    await runNotificationsCommand(harness.ctx);

    expect(harness.component?.render(60).join(" ")).toContain("branch a");

    harness.setEntries([createNotificationEntry("branch b", "info", FIRST)]);

    await runNotificationsCommand(harness.ctx);

    const rendered = harness.component?.render(60).join(" ") ?? "";

    expect(rendered).toContain("branch b");
    expect(rendered).not.toContain("branch a");
    expect(harness.branchReads).toBe(2);
  });

  it("falls back to a notification outside the interactive TUI", async () => {
    const harness = setup([createNotificationEntry("one", "info", FIRST)], {
      mode: "rpc",
    });

    await runNotificationsCommand(harness.ctx);

    expect(harness.component).toBeUndefined();
    expect(harness.notify).toHaveBeenCalledWith(
      "1 notifications have been captured in this session.",
      "info",
    );
  });

  it("reports the empty state outside the interactive TUI", async () => {
    const harness = setup([], { mode: "print" });

    await runNotificationsCommand(harness.ctx);

    expect(harness.component).toBeUndefined();
    expect(harness.notify).toHaveBeenCalledWith(
      "No notifications have been captured in this session yet.",
      "info",
    );
  });
});

interface CommandHarness {
  branchReads: number;
  component: Component | undefined;
  ctx: NotificationsCommandContext;
  notify: ReturnType<typeof vi.fn>;
  overlay: boolean | undefined;
  overlayOptions: { minWidth?: number; width?: number | string } | undefined;
  setEntries: (entries: NotificationEntry[]) => void;
}

function setup(
  entries: NotificationEntry[],
  options: { mode?: "json" | "print" | "rpc" | "tui" } = {},
): CommandHarness {
  const fake = createFakeTui();
  const notify = vi.fn();

  let current = entries;

  const harness: CommandHarness = {
    branchReads: 0,
    component: undefined,
    ctx: undefined as unknown as NotificationsCommandContext,
    notify,
    overlay: undefined,
    overlayOptions: undefined,
    setEntries: (next) => {
      current = next;
      harness.component = undefined;
    },
  };

  harness.ctx = {
    mode: options.mode ?? "tui",
    sessionManager: {
      getBranch: () => {
        harness.branchReads += 1;

        return current.map((data) => ({
          customType: CUSTOM_ENTRY_TYPE,
          data,
          type: "custom",
        }));
      },
    },
    ui: {
      custom: async (
        factory: (
          tui: unknown,
          theme: unknown,
          keybindings: unknown,
          done: () => void,
        ) => Component,
        customOptions?: {
          overlay?: boolean;
          overlayOptions?: { minWidth?: number; width?: number | string };
        },
      ) => {
        harness.overlay = customOptions?.overlay;
        harness.overlayOptions = customOptions?.overlayOptions;
        harness.component = await Promise.resolve(
          factory(
            fake.tui,
            createPlainTheme(),
            createFakeKeybindings(),
            () => undefined,
          ),
        );

        return undefined as never;
      },
      notify,
    },
  } as unknown as NotificationsCommandContext;

  return harness;
}
