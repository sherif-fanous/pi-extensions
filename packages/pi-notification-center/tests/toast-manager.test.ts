import { createNotificationEntry } from "../src/history.js";
import {
  DEFAULT_CONFIG,
  type NotificationConfig,
  type ToastConfig,
} from "../src/types.js";
import { ToastManager } from "../src/ui/toast-manager.js";
import { TOAST_FRAME_ROWS } from "../src/ui/toast-stack.js";
import type { BridgeUi } from "../src/ui/tui-bridge.js";
import { createFakeTui, createFakeWidgets, type FakeTui } from "./helpers.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ConfigOverrides {
  maxToastsVisible?: number;
  toast?: Partial<ToastConfig>;
}

describe("ToastManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an arriving toast on a passive surface", async () => {
    const { fake, manager } = setup();

    manager.show(createNotificationEntry("hello", "info", 1));

    await vi.advanceTimersByTimeAsync(0);

    expect(lines(fake)[1]).toContain("hello");
    // One overlay for the session, and never any focus change.
    expect(fake.overlays).toHaveLength(1);
    expect(fake.focusCalls).toBe(0);
  });

  it("uses a single surface for a burst", async () => {
    const { fake, manager } = setup();

    for (let index = 0; index < 4; index += 1) {
      manager.show(createNotificationEntry(`m${String(index)}`, "info", index));
    }

    await vi.advanceTimersByTimeAsync(0);

    expect(lines(fake).join(" ")).toContain("m3");
    expect(fake.overlays).toHaveLength(1);
    expect(fake.overlays[0]?.hideCalls).toBe(0);
    expect(fake.focusCalls).toBe(0);
  });

  it("expires each toast independently from its own arrival", async () => {
    const { fake, manager } = setup({ toast: { timeout: 1000 } });

    manager.show(createNotificationEntry("old", "info", 1));

    await vi.advanceTimersByTimeAsync(600);

    manager.show(createNotificationEntry("new", "info", 2));

    await vi.advanceTimersByTimeAsync(400);

    // The first toast has reached 1000ms; the second has reached 400ms.
    expect(lines(fake)).toHaveLength(TOAST_FRAME_ROWS + 1);
    expect(lines(fake)[1]).toContain("new");

    await vi.advanceTimersByTimeAsync(600);

    expect(lines(fake)).toHaveLength(0);
  });

  it("compacts the stack when an older toast expires", async () => {
    const { fake, manager } = setup({ toast: { timeout: 1000 } });

    manager.show(createNotificationEntry("first", "info", 1));

    await vi.advanceTimersByTimeAsync(500);

    manager.show(createNotificationEntry("second", "info", 2));
    manager.show(createNotificationEntry("third", "info", 3));

    await vi.advanceTimersByTimeAsync(500);

    const remaining = lines(fake);

    expect(remaining).toHaveLength(2 * (TOAST_FRAME_ROWS + 1));
    expect(remaining[1]).toContain("second");
    expect(remaining[4]).toContain("third");
  });

  it("evicts the oldest visible toast beyond maxVisible", async () => {
    const { fake, manager } = setup({ maxToastsVisible: 2 });

    manager.show(createNotificationEntry("a", "info", 1));
    manager.show(createNotificationEntry("b", "info", 2));
    manager.show(createNotificationEntry("c", "info", 3));

    await vi.advanceTimersByTimeAsync(0);

    const shown = lines(fake);

    expect(shown).toHaveLength(2 * (TOAST_FRAME_ROWS + 1));
    expect(shown[1]).toContain("b");
    expect(shown[4]).toContain("c");
  });

  it("hides but keeps the surface once the stack empties", async () => {
    const { fake, manager } = setup({ toast: { timeout: 500 } });

    manager.show(createNotificationEntry("bye", "info", 1));

    await vi.advanceTimersByTimeAsync(10);

    expect(fake.overlays[0]?.hidden).toBe(false);

    await vi.advanceTimersByTimeAsync(600);

    expect(fake.overlays[0]?.hidden).toBe(true);
    // Keeping its stack position is what stops it stealing another
    // extension overlay's close.
    expect(fake.overlays[0]?.hideCalls).toBe(0);
    expect(lines(fake)).toEqual([]);
  });

  it("reuses the same surface after the stack empties and refills", async () => {
    const { fake, manager } = setup({ toast: { timeout: 500 } });

    manager.show(createNotificationEntry("first", "info", 1));

    await vi.advanceTimersByTimeAsync(600);

    manager.show(createNotificationEntry("second", "info", 2));

    await vi.advanceTimersByTimeAsync(10);

    expect(fake.overlays).toHaveLength(1);
    expect(lines(fake)[1]).toContain("second");
  });

  it("cancels timers and removes the surface on disposal", async () => {
    const { fake, manager } = setup({ toast: { timeout: 1000 } });

    manager.show(createNotificationEntry("pending", "info", 1));

    await vi.advanceTimersByTimeAsync(10);

    const rendersBefore = fake.renderCalls;

    manager.dispose();

    expect(fake.overlays[0]?.hideCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);

    // A disposed manager must not touch the TUI again.
    manager.show(createNotificationEntry("after", "info", 2));

    await vi.runOnlyPendingTimersAsync();

    expect(fake.renderCalls).toBe(rendersBefore);
    expect(fake.overlays).toHaveLength(1);
  });

  it("keeps recording without an overlay when the bridge fails", async () => {
    const ui: BridgeUi = { setWidget: () => undefined };
    const manager = new ToastManager(ui, DEFAULT_CONFIG);

    manager.show(createNotificationEntry("history only", "info", 1));

    await vi.advanceTimersByTimeAsync(0);

    manager.dispose();
  });
});

function config(overrides: ConfigOverrides): NotificationConfig {
  return {
    maxToastsVisible:
      overrides.maxToastsVisible ?? DEFAULT_CONFIG.maxToastsVisible,
    toast: { ...DEFAULT_CONFIG.toast, ...overrides.toast },
  };
}

function lines(fake: FakeTui): string[] {
  const overlay = fake.overlays[0];

  // A hidden overlay renders nothing, mirroring the TUI's own behavior.
  return !overlay || overlay.hidden
    ? []
    : overlay.component.render(DEFAULT_CONFIG.toast.width);
}

function setup(overrides: ConfigOverrides = {}): {
  fake: FakeTui;
  manager: ToastManager;
} {
  const fake = createFakeTui();

  return {
    fake,
    manager: new ToastManager(createFakeWidgets(fake), config(overrides)),
  };
}
