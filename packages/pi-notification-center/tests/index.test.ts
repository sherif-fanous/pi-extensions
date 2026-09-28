import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { EXTENSION_NAME } from "../src/extension-name.js";
import { createNotificationEntry } from "../src/history.js";
import notificationCenter from "../src/index.js";
import { CUSTOM_ENTRY_TYPE, type NotificationEntry } from "../src/types.js";
import type {
  ExtensionCommandContext,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakeCustom,
  createFakePi,
  createFakeTui,
  createFakeWidgets,
  createShownTextRecorder,
  createTempConfigDirs,
  findShownTextViolations,
  type FakeCommand,
  type FakeEntry,
  type FakeTui,
  type FakeWidgets,
  type ShownTextRecorder,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STATUS_REPORT_ENTRY_TYPE = "notification-center:status-report";

let dirs: TempConfigDirs;
let userPath: string;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  userPath = join(dirs.agentDir, "notification-center", "config.json");
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("notification-center lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers the /notifications command with a status completion", async () => {
    const harness = setup();

    expect(await harness.command().getArgumentCompletions?.("")).toEqual([
      {
        description: "Show Notification Center status",
        label: "status",
        value: "status",
      },
    ]);
  });

  it("rejects an unknown argument with a usage warning instead of running", async () => {
    const harness = setup({ mode: "rpc" });

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

  it("runs the command when the argument is only whitespace", async () => {
    const harness = setup({
      entries: [createNotificationEntry("one", "info", 0)],
      mode: "rpc",
    });

    await harness.run("  ");

    expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
      "1 notification has been captured in this session.",
      "info",
    );
  });

  it("records no message when configuration is absent", async () => {
    const harness = setup();

    await harness.start();

    expect(harness.appended).toEqual([]);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("records no message when configuration is valid and current", async () => {
    await dirs.writeJson(userPath, { toast: { maxVisible: 2 }, version: 2 });

    const harness = setup();

    await harness.start();

    expect(harness.appended).toEqual([]);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("records exactly one warning entry for malformed configuration", async () => {
    await dirs.writeText(userPath, "[1]");

    const harness = setup();

    await harness.start();

    expect(harness.appended).toHaveLength(1);
    expect(harness.appended[0]?.customType).toBe(CUSTOM_ENTRY_TYPE);
    expect(harness.appended[0]?.data).toMatchObject({
      message: `Notification Center: 1 warning\n- Configuration at ${userPath} must be a JSON object. Ignored the file.`,
      severity: "warning",
    });

    // The warning travels the capture path, so it never reaches the
    // untouched transcript notify.
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("records several configuration warnings as one warning entry", async () => {
    await dirs.writeJson(userPath, { toast: { maxVisible: 99, width: 1 } });

    const harness = setup();

    await harness.start();

    expect(harness.appended).toHaveLength(1);
    expect(harness.appended[0]?.data).toMatchObject({
      message:
        'Notification Center: 2 warnings\n- Setting "toast.maxVisible" must be an integer from 1 through 10, not 99. Using the default value 5.\n- Setting "toast.width" must be an integer from 20 through 80, not 1. Using the default value 64.',
      severity: "warning",
    });
  });

  it("does not duplicate the warning across reloads", async () => {
    await dirs.writeText(userPath, "[1]");

    const harness = setup();

    await harness.start();

    expect(harness.appended).toHaveLength(1);

    harness.appended.length = 0;
    await harness.start();

    expect(harness.appended).toHaveLength(1);
  });

  it("reports the warning through notify when capture is unavailable", async () => {
    await dirs.writeText(userPath, "[1]");

    const harness = setup({ mode: "rpc" });

    await harness.start();

    expect(harness.appended).toEqual([]);
    expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
      `Notification Center: 1 warning\n- Configuration at ${userPath} must be a JSON object. Ignored the file.`,
      "warning",
    );
  });

  it("migrates old key names at startup and says so once, as info", async () => {
    await dirs.writeJson(userPath, {
      maxToastsVisible: 2,
      toast: { timeout: 1000 },
    });

    const harness = setup();

    await harness.start();

    expect(harness.appended.map((entry) => entry.data)).toEqual([
      expect.objectContaining({
        message: `Notification Center migrated its configuration to ${userPath}.`,
        severity: "info",
      }),
    ]);

    expect(await dirs.readJson(userPath)).toEqual({
      toast: { maxVisible: 2, timeoutMs: 1000 },
      version: 2,
    });

    // The next start finds nothing left to migrate.
    harness.appended.length = 0;
    await harness.start();

    expect(harness.appended).toEqual([]);
  });

  it("drops a start that a shutdown replaced while it read the file", async () => {
    await dirs.writeText(userPath, "[1]");

    const harness = setup();
    // The start is still reading the file when the shutdown arrives.
    const starting = harness.start();

    harness.shutdown();
    await starting;

    expect(harness.fake.overlays).toEqual([]);
    expect(harness.ctx.ui).toHaveProperty("notify", harness.original);
    expect(harness.appended).toEqual([]);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("replaces the previous runtime on reload without leaking timers", async () => {
    const harness = setup();

    await harness.start();
    harness.ctx.ui.notify("first session", "info");

    await vi.advanceTimersByTimeAsync(0);

    expect(harness.fake.overlays).toHaveLength(1);

    await harness.start();

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

    await harness.start();
    harness.ctx.ui.notify("pending", "info");

    await vi.advanceTimersByTimeAsync(0);

    harness.shutdown();

    expect(harness.ctx.ui).toHaveProperty("notify", harness.original);
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.fake.overlays[0]?.hideCalls).toBe(1);
  });

  it("surfaces a startup failure as an error instead of throwing", async () => {
    const harness = setup({ startError: new Error("disk on fire") });

    await expect(harness.start()).resolves.toBeUndefined();

    expect(harness.notify).toHaveBeenCalledWith(
      "Notification Center session_start failed: disk on fire.",
      "error",
    );
  });

  it("does not double the full stop when the failure is already a sentence", async () => {
    const harness = setup({ startError: new Error("Disk on fire.") });

    await harness.start();

    expect(harness.notify).toHaveBeenCalledWith(
      "Notification Center session_start failed: Disk on fire.",
      "error",
    );
  });
});

describe("/notifications status", () => {
  it("adds a status report entry in the TUI", async () => {
    await dirs.writeJson(userPath, {
      toast: { maxLines: 1, maxVisible: 2, timeoutMs: 1000, width: 30 },
    });

    const harness = setup({
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

  it("registers a renderer for the status report entry", () => {
    const harness = setup();

    expect(harness.renderers).toEqual([STATUS_REPORT_ENTRY_TYPE]);
  });

  it("shows the defaults and a missing file as a notification outside the TUI", async () => {
    const harness = setup({ mode: "rpc" });

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

    const harness = setup({ mode: "rpc" });

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

    const harness = setup({ mode: "rpc" });

    await harness.start();
    harness.notify.mockClear();
    await harness.run("status");

    expect(harness.notify.mock.calls[0]?.[0]).toContain(
      '\n- Setting "toast.width" must be an integer from 20 through 80, not 1. Using the default value 64.',
    );
  });

  it("reports the session's configuration, not a later edit", async () => {
    const harness = setup({ mode: "rpc" });

    await harness.start();
    await dirs.writeJson(userPath, { toast: { maxVisible: 2 } });
    await harness.run("status");

    expect(harness.notify.mock.calls[0]?.[0]).toContain(
      "Visible toasts: at most 5",
    );
  });

  it("reads the file when no session has started", async () => {
    await dirs.writeJson(userPath, { maxToastsVisible: 2 });

    const before = await readFile(userPath, "utf8");
    const harness = setup({ mode: "rpc" });

    await harness.run("status");

    expect(harness.notify.mock.calls[0]?.[0]).toContain(
      "Visible toasts: at most 2",
    );
    // Only a session start migrates.
    expect(await readFile(userPath, "utf8")).toBe(before);
  });
});

describe("notification-center shown text", () => {
  it("follows the family text and naming standard", async () => {
    const shown = createShownTextRecorder();
    const entries = [
      createNotificationEntry("first", "info", 0),
      createNotificationEntry("second", "warning", 1000),
    ];

    await dirs.writeJson(userPath, { maxToastsVisible: 99, toast: "wide" });

    // The TUI session start uses the toast bridge widget and records its
    // configuration warning as a history entry.
    const tui = setup({ shown });

    await shown.recordCommand(tui.command());
    await tui.start();
    await tui.run("status");
    tui.shutdown();

    // Old key names migrate once, with an info message.
    await dirs.writeJson(userPath, { toast: { timeout: 1000 } });

    const migrating = setup({ mode: "rpc", shown });

    await migrating.start();

    // Outside the TUI, every answer is a plain notification.
    await dirs.writeJson(userPath, { toast: { width: 1 } });

    const rpc = setup({ mode: "rpc", shown });

    await rpc.start();

    for (const branch of [[], entries.slice(0, 1), entries]) {
      rpc.setEntries(branch);
      await rpc.run("");
    }

    await rpc.run("status");
    await rpc.run("foo");

    const failing = setup({ shown, startError: new Error("disk on fire") });

    await failing.start();

    // The history browser, populated and empty.
    for (const branch of [entries, []]) {
      const rendered: string[] = [];
      const browser = setup({
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
          text: `Notification Center migrated its configuration to ${userPath}.`,
        },
        {
          surface: "notification",
          text: 'Notification Center: 1 warning\n- Unknown subcommand "foo". Try /notifications or /notifications status.',
        },
        {
          surface: "notification",
          text: "Notification Center session_start failed: disk on fire.",
        },
      ]),
    );

    expect(
      shown.texts
        .filter(({ surface }) => surface === "report")
        .map(({ text }) => text.split("\n")[0]),
    ).toEqual(["Notification Center Status"]);

    expect(shown.completions).toEqual([
      expect.objectContaining({ label: "status" }),
    ]);

    expect(shown.keys).toEqual(
      expect.arrayContaining([
        { key: "notification-center:bridge", kind: "widget" },
        { key: CUSTOM_ENTRY_TYPE, kind: "entry" },
        { key: STATUS_REPORT_ENTRY_TYPE, kind: "entry" },
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

interface IndexHarness {
  appended: FakeEntry[];
  branchReads: number;
  command: () => FakeCommand;
  ctx: ExtensionCommandContext;
  fake: FakeTui;
  notify: ReturnType<typeof vi.fn<Notify>>;
  original: Notify;
  renderers: string[];
  run: (args: string) => Promise<void>;
  setEntries: (entries: NotificationEntry[]) => void;
  shutdown: () => void;
  start: () => Promise<void>;
}

interface SetupOptions {
  /** Stand-in for `ctx.ui.custom`, which opens the history browser. */
  custom?: ExtensionUIContext["custom"];
  /** Notifications on the active branch. */
  entries?: NotificationEntry[];
  mode?: "json" | "print" | "rpc" | "tui";
  /** Receives every notification, widget, entry, and command. */
  shown?: ShownTextRecorder;
  /** Thrown when a session start reads `ctx.cwd`, as a stale context does. */
  startError?: Error;
}

type Notify = (message: string, type?: "error" | "info" | "warning") => void;

/** What the extension passes to `ctx.ui.setWidget` besides text lines. */
type WidgetContent = Parameters<FakeWidgets["setWidget"]>[1];

function setup(options: SetupOptions = {}): IndexHarness {
  const fake = createFakeTui();
  const widgets = createFakeWidgets(fake);
  const notify = vi.fn<Notify>(options.shown?.notify);

  let entries = options.entries ?? [];

  const ctx = createFakeContext({
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
    ui: {
      ...(options.custom && { custom: options.custom }),
      notify,
      setWidget: (key: string, content: string[] | WidgetContent) => {
        options.shown?.setWidget(key, content);

        if (!Array.isArray(content)) widgets.setWidget(key, content);
      },
    },
  });

  // A start reads `ctx.cwd` first, so a stale context fails there.
  Object.defineProperty(ctx, "cwd", {
    get(): string {
      if (options.startError) throw options.startError;

      return dirs.cwd;
    },
  });

  const pi = createFakePi({ appendEntry: options.shown?.appendEntry });

  notificationCenter(pi.pi);

  const command = (): FakeCommand => pi.command("notifications");
  const harness: IndexHarness = {
    appended: pi.appendedEntries,
    branchReads: 0,
    command,
    ctx,
    fake,
    notify,
    original: notify,
    renderers: [...pi.entryRenderers.keys()],
    run: (args) => pi.runCommand("notifications", args, ctx),
    setEntries: (next) => {
      entries = next;
    },
    shutdown: () => {
      void pi.emit({ reason: "quit", type: "session_shutdown" }, ctx);
    },
    start: async () => {
      await pi.emit({ reason: "startup", type: "session_start" }, ctx);
    },
  };

  return harness;
}
