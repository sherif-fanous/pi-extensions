import { createThemeSyncRuntime } from "../src/runtime.js";
import {
  createRuntimeContext,
  fakePollingDetector,
  fakeSubscriptionDetector,
} from "./helpers/fake-detectors.js";
import { createDeferred } from "@sherif-fanous/pi-extensions-testing";
import { expect, test, vi } from "vitest";

function createDetectors() {
  const colorScheme = fakePollingDetector("Terminal Color Scheme", "light");
  const osc11 = fakePollingDetector("OSC 11", "dark");
  const system = fakePollingDetector("System Appearance", "dark");
  const subscription = fakeSubscriptionDetector();

  subscription.isSupported.mockResolvedValue(false);

  return {
    colorScheme,
    detectors: {
      polling: [colorScheme, osc11, system],
      subscription: [subscription],
    },
    osc11,
    subscription,
    system,
  };
}

test("startup survives polling and subscription probe failures", async () => {
  const { colorScheme, detectors, osc11, subscription, system } =
    createDetectors();

  colorScheme.detect.mockRejectedValue(new Error("query failed"));
  subscription.isSupported.mockRejectedValue(new Error("probe failed"));

  const ctx = createRuntimeContext();
  const schedule = vi.fn(() => vi.fn());
  const runtime = createThemeSyncRuntime({ detectors, schedule });

  try {
    await runtime.startSession(ctx);

    expect(schedule).toHaveBeenCalledOnce();
    expect(runtime.getStatus(ctx)).toMatchObject({
      availableDetectors: ["OSC 11", "System Appearance"],
      currentAppearance: "dark",
      detectionStrategy: "OSC 11",
      warnings: [
        "Terminal Color Scheme query failed. Using the other available detectors.",
        "Terminal Color Scheme (subscription) query failed. Using the other available detectors.",
      ],
    });

    expect(colorScheme.detect.mock.invocationCallOrder[0]).toBeLessThan(
      osc11.detect.mock.invocationCallOrder[0] ?? 0,
    );

    expect(osc11.detect.mock.invocationCallOrder[0]).toBeLessThan(
      system.detect.mock.invocationCallOrder[0] ?? 0,
    );
  } finally {
    runtime.dispose();
  }
});

test("synchronous detector failure still permits the system fallback", async () => {
  const { colorScheme, detectors, osc11 } = createDetectors();

  colorScheme.detect.mockResolvedValue("unknown");
  osc11.detect.mockImplementation(() => {
    throw new Error("terminal failed");
  });

  const ctx = createRuntimeContext();
  const runtime = createThemeSyncRuntime({
    detectors,
    schedule: () => () => {},
  });

  try {
    await runtime.startSession(ctx);

    expect(runtime.getStatus(ctx)).toMatchObject({
      availableDetectors: ["System Appearance"],
      detectionStrategy: "System Appearance",
      warnings: ["OSC 11 query failed. Using the other available detectors."],
    });
  } finally {
    runtime.dispose();
  }
});

test("a detector failing after discovery falls back and reports only one warning", async () => {
  const { colorScheme, detectors, osc11 } = createDetectors();

  colorScheme.detect
    .mockResolvedValueOnce("light")
    .mockRejectedValue(new Error("query failed"));

  const ctx = createRuntimeContext();
  let cycle = () => {};
  const runtime = createThemeSyncRuntime({
    detectors,
    schedule: (callback) => {
      cycle = callback;

      return () => {};
    },
  });

  try {
    await runtime.startSession(ctx);

    expect(runtime.getStatus(ctx).currentAppearance).toBe("dark");
    cycle();
    await vi.waitFor(() => expect(colorScheme.detect).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(osc11.detect).toHaveBeenCalledTimes(3));

    expect(runtime.getStatus(ctx).warnings).toEqual([
      "Terminal Color Scheme query failed. Using the other available detectors.",
    ]);
  } finally {
    runtime.dispose();
  }
});

test("setup notifies its warnings once and leaves later cycle warnings to status", async () => {
  const { colorScheme, detectors, osc11 } = createDetectors();

  colorScheme.detect.mockRejectedValue(new Error("query failed"));

  const ctx = createRuntimeContext();
  const notify = vi.spyOn(ctx.ui, "notify");
  let cycle = () => {};
  const runtime = createThemeSyncRuntime({
    detectors,
    schedule: (callback) => {
      cycle = callback;

      return () => {};
    },
  });

  try {
    await runtime.startSession(ctx);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Theme Sync: 1 warning\n- Terminal Color Scheme query failed. Using the other available detectors.",
      "warning",
    );

    osc11.detect.mockRejectedValue(new Error("query failed"));
    cycle();
    await vi.waitFor(() =>
      expect(runtime.getStatus(ctx).warnings).toContain(
        "OSC 11 query failed. Using the other available detectors.",
      ),
    );

    expect(notify).toHaveBeenCalledOnce();
  } finally {
    runtime.dispose();
  }
});

test.each(["reject", "unknown", "light"] as const)(
  "dispose during a startup probe prevents further work after %s",
  async (outcome) => {
    const { colorScheme, detectors, osc11, subscription, system } =
      createDetectors();
    const pendingProbe = createDeferred<"unknown" | "light">();

    colorScheme.detect.mockReturnValue(pendingProbe.promise);

    const finishProbe = () => {
      if (outcome === "reject") {
        pendingProbe.reject(new Error("late query failure"));
      } else {
        pendingProbe.resolve(outcome);
      }
    };
    const ctx = createRuntimeContext();
    const schedule = vi.fn(() => vi.fn());
    const runtime = createThemeSyncRuntime({ detectors, schedule });
    const notify = vi.spyOn(ctx.ui, "notify");
    const setup = runtime.startSession(ctx);

    try {
      await vi.waitFor(() => expect(colorScheme.detect).toHaveBeenCalledOnce());

      runtime.dispose();
      finishProbe();
      await setup;

      expect(osc11.detect).not.toHaveBeenCalled();
      expect(system.detect).not.toHaveBeenCalled();
      expect(subscription.isSupported).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
      expect(ctx.appliedThemes).toEqual([]);
      expect(runtime.getStatus(ctx).warnings).toEqual([]);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      runtime.dispose();
      finishProbe();
      await setup;
    }
  },
);

test("all failed probes report no available detectors and start no recurring timer", async () => {
  const { colorScheme, detectors, osc11, system } = createDetectors();

  for (const detector of [colorScheme, osc11, system]) {
    detector.detect.mockRejectedValue(new Error("query failed"));
  }

  const ctx = createRuntimeContext();
  const schedule = vi.fn(() => vi.fn());
  const runtime = createThemeSyncRuntime({ detectors, schedule });

  try {
    await runtime.startSession(ctx);

    expect(schedule).not.toHaveBeenCalled();
    expect(ctx.appliedThemes).toEqual([]);
    expect(runtime.getStatus(ctx)).toMatchObject({
      availableDetectors: [],
      currentAppearance: "unknown",
      detectionStrategy: "No available detectors",
      lastEvent: "Appearance detection failed",
      warnings: [
        "Terminal Color Scheme query failed. Using the other available detectors.",
        "OSC 11 query failed. Using the other available detectors.",
        "System Appearance query failed. Using the other available detectors.",
        "No appearance detectors are available on this terminal.",
        "Sync is on but the appearance is unknown. Did not apply a theme.",
      ],
    });
  } finally {
    runtime.dispose();
  }
});
