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

describe("notification-center registration", () => {
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

  it("registers a renderer for the status report entry", () => {
    const harness = setup();

    expect(harness.renderers).toEqual([STATUS_REPORT_ENTRY_TYPE]);
  });

  it("runs session start, /notifications status, and shutdown on one session", async () => {
    const harness = setup();

    await harness.start();
    harness.ctx.ui.notify("pending", "info");

    await vi.advanceTimersByTimeAsync(0);
    await harness.run("status");

    expect(harness.appended.at(-1)).toMatchObject({
      customType: STATUS_REPORT_ENTRY_TYPE,
      data: {
        body: expect.stringContaining("Toasts:         on") as unknown,
      },
    });

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
      getBranch: () =>
        entries.map((data, index) => ({
          customType: CUSTOM_ENTRY_TYPE,
          data,
          id: `entry-${String(index)}`,
          parentId: null,
          timestamp: new Date(data.timestamp).toISOString(),
          type: "custom",
        })),
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
