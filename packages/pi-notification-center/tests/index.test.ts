import { loadConfig, type LoadConfigResult } from "../src/config.js";
import { EXTENSION_NAME } from "../src/extension-name.js";
import { createNotificationEntry } from "../src/history.js";
import notificationCenter from "../src/index.js";
import {
  CUSTOM_ENTRY_TYPE,
  DEFAULT_CONFIG,
  type NotificationEntry,
} from "../src/types.js";
import type {
  ExtensionAPI,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeCustom,
  createFakeTui,
  createFakeWidgets,
  createShownTextRecorder,
  findShownTextViolations,
  type FakeTui,
  type ShownTextRecorder,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("notification-center lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers the /notifications command", () => {
    const harness = setup();

    expect(harness.commands.has("notifications")).toBe(true);
  });

  it("rejects an argument with a usage warning instead of running", async () => {
    const harness = setup(undefined, { mode: "rpc" });

    await harness.run(" foo ");

    expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
      'Notification Center: 1 warning\n- Unknown subcommand "foo". Try /notifications.',
      "warning",
    );
    expect(harness.branchReads).toBe(0);
  });

  it("runs the command when the argument is only whitespace", async () => {
    const harness = setup(undefined, {
      entries: [createNotificationEntry("one", "info", 0)],
      mode: "rpc",
    });

    await harness.run("  ");

    expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
      "1 notification has been captured in this session.",
      "info",
    );
  });

  it("records no warning when configuration is absent or valid", () => {
    const harness = setup({ config: DEFAULT_CONFIG, warnings: [] });

    harness.start();

    expect(harness.appended).toEqual([]);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("records exactly one warning entry for malformed configuration", () => {
    const harness = setup({
      config: DEFAULT_CONFIG,
      warnings: ["configuration is not valid JSON"],
    });

    harness.start();

    expect(harness.appended).toHaveLength(1);
    expect(harness.appended[0]?.customType).toBe(CUSTOM_ENTRY_TYPE);
    expect(harness.appended[0]?.data).toMatchObject({
      message:
        "Notification Center: 1 warning\n- configuration is not valid JSON",
      severity: "warning",
    });

    // The warning travels the capture path, so it never reaches the
    // untouched transcript notify.
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("records several configuration warnings as one warning entry", () => {
    const harness = setup({
      config: DEFAULT_CONFIG,
      warnings: ["first rejected value", "second rejected value"],
    });

    harness.start();

    expect(harness.appended).toHaveLength(1);
    expect(harness.appended[0]?.data).toMatchObject({
      message:
        "Notification Center: 2 warnings\n- first rejected value\n- second rejected value",
      severity: "warning",
    });
  });

  it("does not duplicate the warning across reloads", () => {
    const harness = setup({
      config: DEFAULT_CONFIG,
      warnings: ["configuration is not valid JSON"],
    });

    harness.start();

    expect(harness.appended).toHaveLength(1);

    harness.appended.length = 0;
    harness.start();

    expect(harness.appended).toHaveLength(1);
  });

  it("reports the warning through notify when capture is unavailable", () => {
    const harness = setup(
      { config: DEFAULT_CONFIG, warnings: ["bad config"] },
      { mode: "rpc" },
    );

    harness.start();

    expect(harness.appended).toEqual([]);
    expect(harness.notify).toHaveBeenCalledWith(
      "Notification Center: 1 warning\n- bad config",
      "warning",
    );
  });

  it("replaces the previous runtime on reload without leaking timers", async () => {
    const harness = setup();

    harness.start();
    harness.ctx.ui.notify("first session", "info");

    await vi.advanceTimersByTimeAsync(0);

    expect(harness.fake.overlays).toHaveLength(1);

    harness.start();

    // The previous runtime's overlay is gone and the new runtime owns its
    // own, so a stale timer cannot render into the live surface.
    expect(harness.fake.overlays[0]?.hideCalls).toBe(1);
    expect(harness.fake.overlays).toHaveLength(2);

    harness.ctx.ui.notify("second session", "info");

    await vi.advanceTimersByTimeAsync(0);

    expect(harness.fake.overlays[1]?.hidden).toBe(false);
  });

  it("restores notify and cancels timers on shutdown", async () => {
    const harness = setup();

    harness.start();
    harness.ctx.ui.notify("pending", "info");

    await vi.advanceTimersByTimeAsync(0);

    harness.shutdown();

    expect(harness.ctx.ui.notify).toBe(harness.original);
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.fake.overlays[0]?.hideCalls).toBe(1);
  });

  it("surfaces a startup failure as an error instead of throwing", () => {
    const harness = setup();

    harness.configLoader.mockImplementation(() => {
      throw new Error("disk on fire");
    });

    expect(() => {
      harness.start();
    }).not.toThrow();

    expect(harness.notify).toHaveBeenCalledWith(
      "Notification Center session_start failed: disk on fire.",
      "error",
    );
  });

  it("does not double the full stop when the failure is already a sentence", () => {
    const harness = setup();

    harness.configLoader.mockImplementation(() => {
      throw new Error("Disk on fire.");
    });

    harness.start();

    expect(harness.notify).toHaveBeenCalledWith(
      "Notification Center session_start failed: Disk on fire.",
      "error",
    );
  });
});

describe("notification-center shown text", () => {
  it("follows the family text and naming standard", async () => {
    const shown = createShownTextRecorder();
    const invalidConfig = (): LoadConfigResult =>
      loadConfig("/agent", {
        readFileSync: () =>
          JSON.stringify({ maxToastsVisible: 99, toast: "wide" }),
      });
    const entries = [
      createNotificationEntry("first", "info", 0),
      createNotificationEntry("second", "warning", 1000),
    ];

    // The TUI session start uses the toast bridge widget and records its
    // configuration warning as a history entry.
    const tui = setup(invalidConfig(), { shown });

    await shown.recordCommand(tui.command());
    tui.start();
    tui.shutdown();

    // Outside the TUI, every answer is a plain notification.
    const rpc = setup(invalidConfig(), { mode: "rpc", shown });

    rpc.start();

    for (const branch of [[], entries.slice(0, 1), entries]) {
      rpc.setEntries(branch);
      await rpc.run("");
    }

    await rpc.run("foo");

    rpc.configLoader.mockImplementation(() => {
      throw new Error("disk on fire");
    });
    rpc.start();

    // The history browser, populated and empty.
    for (const branch of [entries, []]) {
      const rendered: string[] = [];
      const browser = setup(undefined, {
        custom: createFakeCustom({ keys: ["\u001B"], rendered }),
        entries: branch,
        shown,
      });

      await browser.run("");

      for (const line of rendered) shown.record("text", line);
    }

    // Guard against a vacuous pass: each surface actually recorded text.
    expect(shown.texts).toEqual(
      expect.arrayContaining([
        {
          surface: "description",
          text: "Browse this session's notifications",
        },
        {
          surface: "notification",
          text: "2 notifications have been captured in this session.",
        },
        {
          surface: "notification",
          text: 'Notification Center: 1 warning\n- Unknown subcommand "foo". Try /notifications.',
        },
        {
          surface: "notification",
          text: "Notification Center session_start failed: disk on fire.",
        },
      ]),
    );

    expect(shown.keys).toEqual(
      expect.arrayContaining([
        { key: "notification-center:bridge", kind: "widget" },
        { key: CUSTOM_ENTRY_TYPE, kind: "entry" },
      ]),
    );

    expect(
      findShownTextViolations(shown, {
        displayName: EXTENSION_NAME,
        slug: "notification-center",
      }),
    ).toEqual([]);
  });
});

/** A registered command, typed as loosely as the fake `pi` passes it on. */
interface HarnessCommand {
  description?: string;
  handler: (args: string, ctx: unknown) => Promise<void>;
}

interface IndexHarness {
  appended: { customType: string; data: unknown }[];
  branchReads: number;
  command: () => HarnessCommand;
  commands: Map<string, HarnessCommand>;
  configLoader: ReturnType<typeof vi.fn<() => LoadConfigResult>>;
  ctx: { mode: string; ui: { notify: Notify } };
  fake: FakeTui;
  notify: ReturnType<typeof vi.fn<Notify>>;
  original: Notify;
  run: (args: string) => Promise<void>;
  setEntries: (entries: NotificationEntry[]) => void;
  shutdown: () => void;
  start: () => void;
}

interface SetupOptions {
  /** Stand-in for `ctx.ui.custom`, which opens the history browser. */
  custom?: ExtensionUIContext["custom"];
  /** Notifications on the active branch. */
  entries?: NotificationEntry[];
  mode?: "json" | "print" | "rpc" | "tui";
  /** Receives every notification, widget, entry, and command. */
  shown?: ShownTextRecorder;
}

type Notify = (message: string, type?: "error" | "info" | "warning") => void;

function setup(
  result: LoadConfigResult = { config: DEFAULT_CONFIG, warnings: [] },
  options: SetupOptions = {},
): IndexHarness {
  const fake = createFakeTui();
  const widgets = createFakeWidgets(fake);
  const appended: { customType: string; data: unknown }[] = [];
  const commands = new Map<string, HarnessCommand>();
  const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
  const notify = vi.fn<Notify>(options.shown?.notify);
  const configLoader = vi.fn<() => LoadConfigResult>(() => result);

  let entries = options.entries ?? [];

  const ctx = {
    mode: options.mode ?? "tui",
    sessionManager: {
      getBranch: () => {
        harness.branchReads += 1;

        return entries.map((data) => ({
          customType: CUSTOM_ENTRY_TYPE,
          data,
          type: "custom",
        }));
      },
    },
    ui: {
      custom: options.custom,
      notify,
      setWidget: (
        key: string,
        content: Parameters<typeof widgets.setWidget>[1],
      ) => {
        options.shown?.setWidget(key, content);
        widgets.setWidget(key, content);
      },
    },
  };
  const pi = {
    appendEntry: (customType: string, data?: unknown) => {
      appended.push({ customType, data });
      options.shown?.appendEntry(customType, data);
    },
    on: (event: string, handler: (e: unknown, c: unknown) => void) => {
      handlers.set(event, handler);
    },
    registerCommand: (name: string, config: HarnessCommand) => {
      commands.set(name, config);
    },
  } as unknown as ExtensionAPI;

  notificationCenter(pi, configLoader);

  const command = (): HarnessCommand => {
    const registered = commands.get("notifications");

    if (!registered) throw new Error("/notifications is not registered");

    return registered;
  };
  const harness: IndexHarness = {
    appended,
    branchReads: 0,
    command,
    commands,
    configLoader,
    ctx,
    fake,
    notify,
    original: notify,
    run: (args) => command().handler(args, ctx),
    setEntries: (next) => {
      entries = next;
    },
    shutdown: () => {
      handlers.get("session_shutdown")?.({}, ctx);
    },
    start: () => {
      handlers.get("session_start")?.({ reason: "startup" }, ctx);
    },
  };

  return harness;
}
