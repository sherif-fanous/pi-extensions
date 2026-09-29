import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createNotificationEntry } from "../src/history.js";
import {
  createNotificationCenterSession,
  type NotificationCenterSession,
} from "../src/session.js";
import { CUSTOM_ENTRY_TYPE, type NotificationEntry } from "../src/types.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakePi,
  createFakeTui,
  createFakeWidgets,
  createTempConfigDirs,
  type FakeEntry,
  type FakeTui,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dirs: TempConfigDirs;
let userPath: string;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  userPath = join(dirs.agentDir, "notification-center", "config.json");
  vi.useFakeTimers();
});

afterEach(async () => {
  vi.useRealTimers();
  await dirs.cleanup();
});

describe("NotificationCenterSession.startSession", () => {
  it("records no message when configuration is absent", async () => {
    const harness = setup();

    await harness.session.startSession(harness.ctx);

    expect(harness.appended).toEqual([]);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("records no message when configuration is valid and current", async () => {
    await dirs.writeJson(userPath, { toast: { maxVisible: 2 }, version: 2 });

    const harness = setup();

    await harness.session.startSession(harness.ctx);

    expect(harness.appended).toEqual([]);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("records exactly one warning entry for malformed configuration", async () => {
    await dirs.writeText(userPath, "[1]");

    const harness = setup();

    await harness.session.startSession(harness.ctx);

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

    await harness.session.startSession(harness.ctx);

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

    await harness.session.startSession(harness.ctx);

    expect(harness.appended).toHaveLength(1);

    harness.appended.length = 0;
    await harness.session.startSession(harness.ctx);

    expect(harness.appended).toHaveLength(1);
  });

  it("reports the warning through notify when capture is unavailable", async () => {
    await dirs.writeText(userPath, "[1]");

    const harness = setup({ mode: "rpc" });

    await harness.session.startSession(harness.ctx);

    expect(harness.appended).toEqual([]);
    expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
      `Notification Center: 1 warning\n- Configuration at ${userPath} must be a JSON object. Ignored the file.`,
      "warning",
    );
  });

  it("migrates old key names and says so once, as info", async () => {
    await dirs.writeJson(userPath, {
      maxToastsVisible: 2,
      toast: { timeout: 1000 },
    });

    const harness = setup();

    await harness.session.startSession(harness.ctx);

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
    await harness.session.startSession(harness.ctx);

    expect(harness.appended).toEqual([]);
  });

  it("drops a start that a dispose replaced while it read the file", async () => {
    await dirs.writeText(userPath, "[1]");

    const harness = setup();
    // The start is still reading the file when the dispose arrives.
    const starting = harness.session.startSession(harness.ctx);

    harness.session.dispose();
    await starting;

    expect(harness.fake.overlays).toEqual([]);
    expect(harness.ctx.ui).toHaveProperty("notify", harness.notify);
    expect(harness.appended).toEqual([]);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("replaces the previous runtime on reload without leaking timers", async () => {
    const harness = setup();

    await harness.session.startSession(harness.ctx);
    harness.ctx.ui.notify("first session", "info");

    await vi.advanceTimersByTimeAsync(0);

    expect(harness.fake.overlays).toHaveLength(1);

    await harness.session.startSession(harness.ctx);

    // The previous runtime's overlay is gone and the new runtime owns its
    // own, so a stale timer cannot render into the live surface.
    expect(harness.fake.overlays[0]?.hideCalls).toBe(1);
    expect(harness.fake.overlays).toHaveLength(2);

    harness.ctx.ui.notify("second session", "info");

    await vi.advanceTimersByTimeAsync(0);

    expect(harness.fake.overlays[1]?.hidden).toBe(false);
  });
});

describe("NotificationCenterSession.dispose", () => {
  it("restores notify and cancels timers", async () => {
    const harness = setup();

    await harness.session.startSession(harness.ctx);
    harness.ctx.ui.notify("pending", "info");

    await vi.advanceTimersByTimeAsync(0);

    harness.session.dispose();

    expect(harness.ctx.ui).toHaveProperty("notify", harness.notify);
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.fake.overlays[0]?.hideCalls).toBe(1);
  });
});

describe("NotificationCenterSession.getStatus", () => {
  it("reports toasts, the branch's notifications, and the session's configuration", async () => {
    await dirs.writeJson(userPath, { toast: { maxVisible: 2 } });

    const harness = setup({
      entries: [
        createNotificationEntry("one", "info", 0),
        createNotificationEntry("two", "info", 1),
      ],
    });

    await harness.session.startSession(harness.ctx);

    const status = await harness.session.getStatus(harness.ctx);

    expect(status.toasts).toBe(true);
    expect(status.captured).toBe(2);
    expect(status.loaded.config.toast.maxVisible).toBe(2);
    expect(status.loaded.outcome.files.user.state).toBe("loaded");
  });

  it("reports toasts off outside the interactive TUI", async () => {
    const harness = setup({ mode: "rpc" });

    await harness.session.startSession(harness.ctx);

    expect((await harness.session.getStatus(harness.ctx)).toasts).toBe(false);
  });

  it("reports the session's configuration, not a later edit", async () => {
    const harness = setup({ mode: "rpc" });

    await harness.session.startSession(harness.ctx);
    await dirs.writeJson(userPath, { toast: { maxVisible: 2 } });

    const status = await harness.session.getStatus(harness.ctx);

    expect(status.loaded.config.toast.maxVisible).toBe(5);
  });

  it("reads the file without migrating it when no session has started", async () => {
    await dirs.writeJson(userPath, { maxToastsVisible: 2 });

    const before = await readFile(userPath, "utf8");
    const harness = setup({ mode: "rpc" });
    const status = await harness.session.getStatus(harness.ctx);

    expect(status.loaded.config.toast.maxVisible).toBe(2);
    expect(status.toasts).toBe(false);
    // Only a session start migrates.
    expect(await readFile(userPath, "utf8")).toBe(before);
  });
});

interface SessionHarness {
  appended: FakeEntry[];
  ctx: ExtensionCommandContext;
  fake: FakeTui;
  notify: ReturnType<typeof vi.fn<Notify>>;
  session: NotificationCenterSession;
}

type Notify = (message: string, type?: "error" | "info" | "warning") => void;

function setup(
  options: {
    /** Notifications on the active branch. */
    entries?: NotificationEntry[];
    mode?: "json" | "print" | "rpc" | "tui";
  } = {},
): SessionHarness {
  const fake = createFakeTui();
  const notify = vi.fn<Notify>();
  const entries = options.entries ?? [];
  const ctx = createFakeContext({
    cwd: dirs.cwd,
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
    ui: { notify, setWidget: createFakeWidgets(fake).setWidget },
  });
  const pi = createFakePi();

  return {
    appended: pi.appendedEntries,
    ctx,
    fake,
    notify,
    session: createNotificationCenterSession(pi.pi),
  };
}
