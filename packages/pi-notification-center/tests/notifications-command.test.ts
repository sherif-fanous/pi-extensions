import { join } from "node:path";

import {
  runNotificationsCommand,
  showNotificationHistory,
  type NotificationsCommandContext,
} from "../src/commands/notifications.js";
import { createNotificationEntry } from "../src/history.js";
import { createNotificationCenterSession } from "../src/session.js";
import { CUSTOM_ENTRY_TYPE, type NotificationEntry } from "../src/types.js";
import { HistoryViewComponent } from "../src/ui/history-view.js";
import type { Component } from "@earendil-works/pi-tui";
import {
  createFakeContext,
  createFakeKeybindings,
  createFakePi,
  createFakeTui,
  createFakeWidgets,
  createPlainTheme,
  createTempConfigDirs,
  type FakeEntry,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FIRST = 1_715_933_350_000;
const STATUS_REPORT_ENTRY_TYPE = "notification-center:status-report";

describe("runNotificationsCommand", () => {
  let dirs: TempConfigDirs;
  let userPath: string;

  beforeEach(async () => {
    dirs = await createTempConfigDirs();
    userPath = join(dirs.agentDir, "notification-center", "config.json");
  });

  afterEach(async () => {
    await dirs.cleanup();
  });

  it("rejects an unknown argument with a usage warning instead of running", async () => {
    const harness = commandSetup(dirs, { mode: "rpc" });

    await harness.run(" foo ");
    await harness.run("status foo");

    expect(harness.notify.mock.calls).toEqual([
      [
        'Notification Center: 1 warning\n- Unknown subcommand "foo". Try /notifications or /notifications status.',
        "warning",
      ],
      [
        'Notification Center: 1 warning\n- Unknown subcommand "status foo". Try /notifications or /notifications status.',
        "warning",
      ],
    ]);
    expect(harness.branchReads).toBe(0);
  });

  it("shows the history when the argument is only whitespace", async () => {
    const harness = commandSetup(dirs, {
      entries: [createNotificationEntry("one", "info", 0)],
      mode: "rpc",
    });

    await harness.run("  ");

    expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
      "1 notification has been captured in this session.",
      "info",
    );
  });

  it("adds a status report entry in the TUI", async () => {
    await dirs.writeJson(userPath, {
      toast: { maxLines: 1, maxVisible: 2, timeoutMs: 1000, width: 30 },
    });

    const harness = commandSetup(dirs, {
      entries: [
        createNotificationEntry("one", "info", 0),
        createNotificationEntry("two", "info", 1),
      ],
    });

    await harness.start();
    await harness.run("status");

    expect(harness.appended).toEqual([
      {
        customType: STATUS_REPORT_ENTRY_TYPE,
        data: {
          body: [
            "Notification Center Status",
            "  Toasts:         on",
            "  Captured:       2 notifications",
            "  Visible toasts: at most 2",
            "  Toast timeout:  1000ms",
            "  Toast height:   at most 1 line",
            "  Toast width:    at most 30 columns",
            "",
            "Config:",
            "  User: loaded",
            `        ${userPath}`,
          ].join("\n"),
        },
      },
    ]);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("shows the defaults and a missing file as a notification outside the TUI", async () => {
    const harness = commandSetup(dirs, { mode: "rpc" });

    await harness.start();
    await harness.run("status");

    expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
      [
        "Notification Center Status",
        "  Toasts:         off",
        "  Captured:       0 notifications",
        "  Visible toasts: at most 5",
        "  Toast timeout:  3000ms",
        "  Toast height:   at most 5 lines",
        "  Toast width:    at most 64 columns",
        "",
        "Config:",
        "  User: not found",
        `        ${userPath}`,
      ].join("\n"),
      "info",
    );
  });

  it("shows a file problem in the Config block and value problems under Warnings", async () => {
    await dirs.writeJson(userPath, { toast: { width: 1 }, version: 3 });

    const harness = commandSetup(dirs, { mode: "rpc" });

    await harness.start();
    harness.notify.mockClear();
    await harness.run("status");

    const body = harness.notify.mock.calls[0]?.[0] ?? "";

    expect(body).toContain(
      `Config:\n  User: invalid: unsupported version 3\n        ${userPath}`,
    );
    expect(body).not.toContain("Warnings:");
  });

  it("lists the invalid values under Warnings", async () => {
    await dirs.writeJson(userPath, { toast: { width: 1 } });

    const harness = commandSetup(dirs, { mode: "rpc" });

    await harness.start();
    harness.notify.mockClear();
    await harness.run("status");

    expect(harness.notify.mock.calls[0]?.[0]).toContain(
      '\n- Setting "toast.width" must be an integer from 20 through 80, not 1. Using the default value 64.',
    );
  });
});

describe("showNotificationHistory", () => {
  it("opens a focused overlay listing the captured notifications", async () => {
    const harness = setup([
      createNotificationEntry("older", "info", FIRST),
      createNotificationEntry("newer", "error", FIRST + 1000),
    ]);

    await showNotificationHistory(harness.ctx);

    expect(harness.component).toBeInstanceOf(HistoryViewComponent);
    expect(harness.overlay).toBe(true);
    expect(harness.notify).not.toHaveBeenCalled();

    const rendered = harness.component?.render(60).join(" ") ?? "";

    expect(rendered).toContain("newer");
    expect(rendered).toContain("older");
    expect(rendered.indexOf("newer")).toBeLessThan(rendered.indexOf("older"));
  });

  // Pi's default sizing is far too narrow for a split layout, and the
  // family opens every top-level surface centered at the main size.
  it("opens the browser at the family's main overlay size", async () => {
    const harness = setup([createNotificationEntry("one", "info", FIRST)]);

    await showNotificationHistory(harness.ctx);

    expect(harness.overlayOptions).toMatchObject({
      anchor: "center",
      margin: 1,
      maxHeight: "80%",
      minWidth: 60,
      width: "80%",
    });
  });

  it("opens the overlay with an empty state when nothing was captured", async () => {
    const harness = setup([]);

    await showNotificationHistory(harness.ctx);

    expect(harness.component?.render(60).join(" ")).toContain(
      "No notifications have been captured",
    );
  });

  it("re-reads the branch on every invocation", async () => {
    const harness = setup([createNotificationEntry("branch a", "info", FIRST)]);

    await showNotificationHistory(harness.ctx);

    expect(harness.component?.render(60).join(" ")).toContain("branch a");

    harness.setEntries([createNotificationEntry("branch b", "info", FIRST)]);

    await showNotificationHistory(harness.ctx);

    const rendered = harness.component?.render(60).join(" ") ?? "";

    expect(rendered).toContain("branch b");
    expect(rendered).not.toContain("branch a");
    expect(harness.branchReads).toBe(2);
  });

  it("falls back to a notification outside the interactive TUI", async () => {
    const harness = setup(
      [
        createNotificationEntry("one", "info", FIRST),
        createNotificationEntry("two", "info", FIRST),
      ],
      { mode: "rpc" },
    );

    await showNotificationHistory(harness.ctx);

    expect(harness.component).toBeUndefined();
    expect(harness.notify).toHaveBeenCalledWith(
      "2 notifications have been captured in this session.",
      "info",
    );
  });

  it("counts a single notification in the singular", async () => {
    const harness = setup([createNotificationEntry("one", "info", FIRST)], {
      mode: "rpc",
    });

    await showNotificationHistory(harness.ctx);

    expect(harness.notify).toHaveBeenCalledWith(
      "1 notification has been captured in this session.",
      "info",
    );
  });

  it("reports the empty state outside the interactive TUI", async () => {
    const harness = setup([], { mode: "print" });

    await showNotificationHistory(harness.ctx);

    expect(harness.component).toBeUndefined();
    expect(harness.notify).toHaveBeenCalledWith(
      "No notifications have been captured in this session yet.",
      "info",
    );
  });

  it("answers in words when the terminal is too narrow for the browser", async () => {
    const harness = setup([
      createNotificationEntry("one", "info", FIRST),
      createNotificationEntry("two", "info", FIRST),
    ]);

    await showNotificationHistory(harness.ctx, () => 38);

    expect(harness.component).toBeUndefined();
    expect(harness.notify).toHaveBeenCalledWith(
      "2 notifications have been captured in this session.",
      "info",
    );
  });

  it("reports the empty state when the terminal is too narrow", async () => {
    const harness = setup([]);

    await showNotificationHistory(harness.ctx, () => 38);

    expect(harness.component).toBeUndefined();
    expect(harness.notify).toHaveBeenCalledWith(
      "No notifications have been captured in this session yet.",
      "info",
    );
  });

  it("opens the browser at the narrowest width that fits it", async () => {
    const harness = setup([createNotificationEntry("one", "info", FIRST)]);

    await showNotificationHistory(harness.ctx, () => 39);

    expect(harness.component).toBeInstanceOf(HistoryViewComponent);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  // Suppressing a browser that would have worked is the worse mistake, so
  // an unreadable width opens it and lets the overlay predicate decide.
  it("opens the browser when the terminal width cannot be read", async () => {
    const harness = setup([createNotificationEntry("one", "info", FIRST)]);

    await showNotificationHistory(harness.ctx, () => undefined);

    expect(harness.component).toBeInstanceOf(HistoryViewComponent);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("withdraws the overlay when the terminal is narrowed while it is open", async () => {
    const harness = setup([createNotificationEntry("one", "info", FIRST)]);

    await showNotificationHistory(harness.ctx, () => 100);

    const visible = harness.overlayOptions?.visible;

    expect(visible?.(100, 40)).toBe(true);
    expect(visible?.(39, 40)).toBe(true);
    expect(visible?.(38, 40)).toBe(false);
  });
});

interface CommandHarness {
  branchReads: number;
  component: Component | undefined;
  ctx: NotificationsCommandContext;
  notify: ReturnType<typeof vi.fn>;
  overlay: boolean | undefined;
  overlayOptions: OverlayOptionsProbe | undefined;
  setEntries: (entries: NotificationEntry[]) => void;
}

interface OverlayOptionsProbe {
  minWidth?: number;
  visible?: (termWidth: number, termHeight: number) => boolean;
  width?: number | string;
}

interface RunHarness {
  appended: FakeEntry[];
  branchReads: number;
  notify: ReturnType<typeof vi.fn<Notify>>;
  run: (args: string) => Promise<void>;
  start: () => Promise<void>;
}

type Notify = (message: string, type?: "error" | "info" | "warning") => void;

/** A command run against a real session, reading config from `dirs`. */
function commandSetup(
  dirs: TempConfigDirs,
  options: {
    entries?: NotificationEntry[];
    mode?: "json" | "print" | "rpc" | "tui";
  } = {},
): RunHarness {
  const entries = options.entries ?? [];
  const notify = vi.fn<Notify>();
  const ctx = createFakeContext({
    cwd: dirs.cwd,
    mode: options.mode ?? "tui",
    sessionManager: {
      getBranch: () => {
        harness.branchReads += 1;

        return entries.map((data, index) => ({
          customType: CUSTOM_ENTRY_TYPE,
          data,
          id: `entry-${String(index)}`,
          parentId: null,
          timestamp: new Date(data.timestamp).toISOString(),
          type: "custom",
        }));
      },
    },
    ui: { notify, setWidget: createFakeWidgets(createFakeTui()).setWidget },
  });
  const pi = createFakePi();
  const session = createNotificationCenterSession(pi.pi);
  const harness: RunHarness = {
    appended: pi.appendedEntries,
    branchReads: 0,
    notify,
    run: (args) => runNotificationsCommand(args, ctx, { pi: pi.pi, session }),
    start: () => session.startSession(ctx),
  };

  return harness;
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
          overlayOptions?: OverlayOptionsProbe;
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
