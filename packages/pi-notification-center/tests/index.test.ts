import type { LoadConfigResult } from "../src/config.js";
import notificationCenter from "../src/index.js";
import { CUSTOM_ENTRY_TYPE, DEFAULT_CONFIG } from "../src/types.js";
import { createFakeTui, createFakeWidgets, type FakeTui } from "./helpers.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
      message: "configuration is not valid JSON",
      severity: "warning",
    });

    // The warning travels the capture path, so it never reaches the
    // untouched transcript notify.
    expect(harness.notify).not.toHaveBeenCalled();
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
    expect(harness.notify).toHaveBeenCalledWith("bad config", "warning");
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
      "The notification center failed to start: disk on fire.",
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
      "The notification center failed to start: Disk on fire.",
      "error",
    );
  });
});

interface IndexHarness {
  appended: { customType: string; data: unknown }[];
  commands: Map<string, unknown>;
  configLoader: ReturnType<typeof vi.fn<() => LoadConfigResult>>;
  ctx: { mode: string; ui: { notify: (m: string, t?: string) => void } };
  fake: FakeTui;
  notify: ReturnType<typeof vi.fn>;
  original: (message: string, type?: string) => void;
  shutdown: () => void;
  start: () => void;
}

function setup(
  result: LoadConfigResult = { config: DEFAULT_CONFIG, warnings: [] },
  options: { mode?: "json" | "print" | "rpc" | "tui" } = {},
): IndexHarness {
  const fake = createFakeTui();
  const appended: { customType: string; data: unknown }[] = [];
  const commands = new Map<string, unknown>();
  const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
  const notify = vi.fn();
  const configLoader = vi.fn<() => LoadConfigResult>(() => result);
  const ctx = {
    mode: options.mode ?? "tui",
    ui: {
      notify,
      setWidget: createFakeWidgets(fake).setWidget,
    },
  };
  const pi = {
    appendEntry: (customType: string, data?: unknown) => {
      appended.push({ customType, data });
    },
    on: (event: string, handler: (e: unknown, c: unknown) => void) => {
      handlers.set(event, handler);
    },
    registerCommand: (name: string, config: unknown) => {
      commands.set(name, config);
    },
  } as unknown as ExtensionAPI;

  notificationCenter(pi, configLoader);

  return {
    appended,
    commands,
    configLoader,
    ctx,
    fake,
    notify,
    original: notify,
    shutdown: () => {
      handlers.get("session_shutdown")?.({}, ctx);
    },
    start: () => {
      handlers.get("session_start")?.({ reason: "startup" }, ctx);
    },
  };
}
