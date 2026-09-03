import {
  CaptureRuntime,
  type CaptureContext,
  type CapturePi,
  type NotifyFn,
} from "../src/capture.js";
import { readNotificationHistory, type BranchEntry } from "../src/history.js";
import { CUSTOM_ENTRY_TYPE, DEFAULT_CONFIG } from "../src/types.js";
import { createFakeTui, createFakeWidgets, type FakeTui } from "./helpers.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("CaptureRuntime.install", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures every severity and keeps it out of the transcript", () => {
    const harness = setup();

    harness.ctx.ui.notify("an info", "info");
    harness.ctx.ui.notify("a warning", "warning");
    harness.ctx.ui.notify("an error", "error");

    expect(harness.original).not.toHaveBeenCalled();
    expect(history(harness)).toEqual([
      { message: "an info", severity: "info" },
      { message: "a warning", severity: "warning" },
      { message: "an error", severity: "error" },
    ]);
  });

  it("defaults a missing severity to info", () => {
    const harness = setup();

    harness.ctx.ui.notify("no type given");

    expect(history(harness)[0]).toEqual({
      message: "no type given",
      severity: "info",
    });
  });

  it("persists exactly one entry per call", () => {
    const harness = setup();

    harness.ctx.ui.notify("once", "info");

    expect(harness.appended).toHaveLength(1);
    expect(harness.appended[0]?.customType).toBe(CUSTOM_ENTRY_TYPE);
  });

  it("stores the complete multiline message", () => {
    const harness = setup();
    const message = "line one\nline two\n\nline four";

    harness.ctx.ui.notify(message, "warning");

    expect(history(harness)[0]?.message).toBe(message);
  });

  it("enqueues one toast per captured notification", async () => {
    const harness = setup();

    harness.ctx.ui.notify("toasted", "info");

    await vi.advanceTimersByTimeAsync(0);

    const overlay = harness.fake.overlays[0];

    expect(overlay?.hidden).toBe(false);
    expect(overlay?.component.render(DEFAULT_CONFIG.toast.width)[1]).toContain(
      "toasted",
    );
  });

  it("still captures when session persistence fails", () => {
    const harness = setup({
      appendEntry: () => {
        throw new Error("ephemeral session");
      },
    });

    expect(() => {
      harness.ctx.ui.notify("no session", "info");
    }).not.toThrow();
  });
});

describe("CaptureRuntime outside the interactive TUI", () => {
  it("does not wrap notify in print or JSON mode", () => {
    const harness = setup({ mode: "print" });

    expect(harness.runtime).toBeUndefined();
    expect(harness.ctx.ui.notify).toBe(harness.original);

    harness.ctx.ui.notify("passthrough", "info");

    expect(harness.original).toHaveBeenCalledWith("passthrough", "info");
    expect(harness.appended).toEqual([]);
  });

  it("does not wrap notify in RPC mode", () => {
    // RPC reports hasUI true, so mode is what distinguishes it.
    const harness = setup({ mode: "rpc" });

    expect(harness.runtime).toBeUndefined();
    expect(harness.ctx.ui.notify).toBe(harness.original);

    harness.ctx.ui.notify("passthrough", "warning");

    expect(harness.original).toHaveBeenCalledWith("passthrough", "warning");
    expect(harness.appended).toEqual([]);
  });
});

describe("CaptureRuntime.dispose", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores the original notify function", () => {
    const harness = setup();

    harness.runtime?.dispose();

    expect(harness.ctx.ui.notify).toBe(harness.original);
  });

  it("never overwrites a wrapper installed after ours", () => {
    const harness = setup();
    const later: NotifyFn = vi.fn();

    harness.ctx.ui.notify = later;
    harness.runtime?.dispose();

    expect(harness.ctx.ui.notify).toBe(later);
  });

  it("stops capturing and stops mutating the UI after disposal", async () => {
    const harness = setup();

    harness.ctx.ui.notify("before", "info");

    await vi.advanceTimersByTimeAsync(0);

    const wrapper = harness.ctx.ui.notify;
    const rendersBefore = harness.fake.renderCalls;

    harness.runtime?.dispose();

    expect(harness.fake.overlays[0]?.hideCalls).toBe(1);

    // Any straggler still holding the wrapper must be inert.
    wrapper("after", "info");

    await vi.advanceTimersByTimeAsync(0);

    expect(harness.appended).toHaveLength(1);
    expect(harness.fake.renderCalls).toBe(rendersBefore);
    expect(harness.fake.overlays).toHaveLength(1);
  });

  it("is idempotent", () => {
    const harness = setup();

    harness.runtime?.dispose();
    harness.runtime?.dispose();

    expect(harness.ctx.ui.notify).toBe(harness.original);
  });
});

describe("CaptureRuntime.warn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records exactly one warning entry without recursing", () => {
    const harness = setup();

    harness.runtime?.warn("configuration was rejected");

    expect(history(harness)).toEqual([
      { message: "configuration was rejected", severity: "warning" },
    ]);
    expect(harness.original).not.toHaveBeenCalled();
  });
});

interface Harness {
  appended: { customType: string; data: unknown }[];
  ctx: CaptureContext;
  fake: FakeTui;
  original: NotifyFn;
  runtime: CaptureRuntime | undefined;
}

function history(harness: Harness): { message: string; severity: string }[] {
  const branch: BranchEntry[] = harness.appended.map((entry) => ({
    customType: entry.customType,
    data: entry.data,
    type: "custom",
  }));

  return readNotificationHistory(branch).map((entry) => ({
    message: entry.message,
    severity: entry.severity,
  }));
}

function setup(
  options: {
    appendEntry?: CapturePi["appendEntry"];
    mode?: "json" | "print" | "rpc" | "tui";
  } = {},
): Harness {
  const fake = createFakeTui();
  const appended: { customType: string; data: unknown }[] = [];
  const original: NotifyFn = vi.fn();
  const ctx = {
    mode: options.mode ?? "tui",
    ui: {
      notify: original,
      setWidget: createFakeWidgets(fake).setWidget,
    },
  } as unknown as CaptureContext;
  const pi: CapturePi = {
    appendEntry:
      options.appendEntry ??
      ((customType: string, data?: unknown) => {
        appended.push({ customType, data });
      }),
  };

  return {
    appended,
    ctx,
    fake,
    original,
    runtime: CaptureRuntime.install(ctx, pi, DEFAULT_CONFIG),
  };
}
