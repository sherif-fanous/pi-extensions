import { promises as fs } from "node:fs";

import {
  probeAvailablePollingDetectors,
  probeAvailableSubscriptionDetectors,
} from "../src/detectors/index.js";
import { detectAppearanceViaColorScheme } from "../src/detectors/pi/color-scheme.js";
import { detectAppearanceViaSystem } from "../src/detectors/system/appearance.js";
import { probeDecMode2031Support } from "../src/detectors/terminal/dec-mode-2031.js";
import { detectAppearanceViaOsc11Background } from "../src/detectors/terminal/osc-11.js";
import { createThemeSyncRuntime } from "../src/runtime.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/detectors/pi/color-scheme.js", () => ({
  detectAppearanceViaColorScheme: vi.fn(),
  enableColorSchemeSubscription: vi.fn(),
  hasColorSchemeApi: () => true,
}));

vi.mock("../src/detectors/system/appearance.js", () => ({
  detectAppearanceViaSystem: vi.fn(),
}));

vi.mock("../src/detectors/terminal/dec-mode-2031.js", () => ({
  probeDecMode2031Support: vi.fn(),
}));

vi.mock("../src/detectors/terminal/osc-11.js", () => ({
  detectAppearanceViaOsc11Background: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(detectAppearanceViaColorScheme).mockResolvedValue("light");
  vi.mocked(detectAppearanceViaOsc11Background).mockResolvedValue("dark");
  vi.mocked(detectAppearanceViaSystem).mockResolvedValue("dark");
  vi.mocked(probeDecMode2031Support).mockResolvedValue("unsupported");
  vi.spyOn(fs, "readFile").mockRejectedValue(
    Object.assign(new Error("Missing test config"), { code: "ENOENT" }),
  );
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

test("a rejected first detector does not block lower-priority probes", async () => {
  vi.mocked(detectAppearanceViaColorScheme).mockRejectedValue(
    new Error("query failed"),
  );

  const reportFailure = vi.fn();

  expect(
    await probeAvailablePollingDetectors(
      createContext(),
      undefined,
      reportFailure,
    ),
  ).toEqual(["osc-11", "system"]);
  expect(reportFailure).toHaveBeenCalledExactlyOnceWith("color-scheme");
  expect(
    vi.mocked(detectAppearanceViaColorScheme).mock.invocationCallOrder[0],
  ).toBeLessThan(
    vi.mocked(detectAppearanceViaOsc11Background).mock.invocationCallOrder[0] ??
      0,
  );

  expect(
    vi.mocked(detectAppearanceViaOsc11Background).mock.invocationCallOrder[0],
  ).toBeLessThan(
    vi.mocked(detectAppearanceViaSystem).mock.invocationCallOrder[0] ?? 0,
  );
});

test("synchronous detector failure still permits the system fallback", async () => {
  vi.mocked(detectAppearanceViaColorScheme).mockResolvedValue("unknown");
  vi.mocked(detectAppearanceViaOsc11Background).mockImplementation(() => {
    throw new Error("terminal failed");
  });

  const reportFailure = vi.fn();

  expect(
    await probeAvailablePollingDetectors(
      createContext(),
      undefined,
      reportFailure,
    ),
  ).toEqual(["system"]);
  expect(reportFailure).toHaveBeenCalledExactlyOnceWith("osc-11");
});

test("a failed subscription probe returns no subscriptions", async () => {
  vi.mocked(probeDecMode2031Support).mockRejectedValue(
    new Error("probe failed"),
  );

  const reportFailure = vi.fn();

  expect(
    await probeAvailableSubscriptionDetectors(
      createContext(),
      undefined,
      reportFailure,
    ),
  ).toEqual([]);

  expect(reportFailure).toHaveBeenCalledExactlyOnceWith(
    "color-scheme-subscription",
  );
});

test("startup survives polling and subscription probe failures", async () => {
  vi.mocked(detectAppearanceViaColorScheme).mockRejectedValue(
    new Error("query failed"),
  );

  vi.mocked(probeDecMode2031Support).mockRejectedValue(
    new Error("probe failed"),
  );

  const ctx = createContext();
  const runtime = createThemeSyncRuntime();
  const schedule = vi.fn(() => vi.fn());

  try {
    await runtime.setupAppearanceMonitoring(ctx, schedule);

    expect(schedule).toHaveBeenCalledOnce();
    expect(runtime.getStatus(ctx)).toMatchObject({
      currentAppearance: "dark",
      detectionStrategy: "OSC 11",
      warnings: [
        "Terminal Color Scheme query failed. Other available detectors will be used.",
        "Terminal Color Scheme (subscription) query failed. Other available detectors will be used.",
      ],
    });
  } finally {
    runtime.cleanup();
  }
});

test("a detector failing after discovery falls back and reports only one warning", async () => {
  vi.mocked(detectAppearanceViaColorScheme)
    .mockResolvedValueOnce("light")
    .mockRejectedValue(new Error("query failed"));

  const ctx = createContext();
  const runtime = createThemeSyncRuntime();
  let cycle = () => {};

  try {
    await runtime.setupAppearanceMonitoring(ctx, (callback) => {
      cycle = callback;

      return () => {};
    });

    expect(runtime.getStatus(ctx).currentAppearance).toBe("dark");
    cycle();
    await vi.waitFor(() =>
      expect(detectAppearanceViaColorScheme).toHaveBeenCalledTimes(3),
    );

    await vi.waitFor(() =>
      expect(detectAppearanceViaOsc11Background).toHaveBeenCalledTimes(3),
    );

    expect(runtime.getStatus(ctx).warnings).toEqual([
      "Terminal Color Scheme query failed. Other available detectors will be used.",
    ]);
  } finally {
    runtime.cleanup();
  }
});

test.each(["reject", "unknown", "light"] as const)(
  "cleanup during a startup probe prevents further work after %s",
  async (outcome) => {
    let finishProbe = () => {};
    const pendingProbe = new Promise<"unknown" | "light">((resolve, reject) => {
      finishProbe = () => {
        if (outcome === "reject") {
          reject(new Error("late query failure"));
        } else {
          resolve(outcome);
        }
      };
    });

    vi.mocked(detectAppearanceViaColorScheme).mockReturnValue(pendingProbe);

    const ctx = createContext();
    const runtime = createThemeSyncRuntime();
    const schedule = vi.fn(() => vi.fn());
    const setTheme = vi.spyOn(ctx.ui, "setTheme");
    const setup = runtime.setupAppearanceMonitoring(ctx, schedule);

    try {
      await vi.waitFor(() =>
        expect(detectAppearanceViaColorScheme).toHaveBeenCalledOnce(),
      );

      runtime.cleanup();
      finishProbe();
      await setup;

      expect(detectAppearanceViaOsc11Background).not.toHaveBeenCalled();
      expect(detectAppearanceViaSystem).not.toHaveBeenCalled();
      expect(probeDecMode2031Support).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
      expect(setTheme).not.toHaveBeenCalled();
      expect(runtime.getStatus(ctx).warnings).toEqual([]);
    } finally {
      runtime.cleanup();
      finishProbe();
      await setup;
    }
  },
);

test("all failed probes leave startup alive with no recurring timer", async () => {
  vi.mocked(detectAppearanceViaColorScheme).mockRejectedValue(
    new Error("query failed"),
  );

  vi.mocked(detectAppearanceViaOsc11Background).mockRejectedValue(
    new Error("query failed"),
  );

  vi.mocked(detectAppearanceViaSystem).mockRejectedValue(
    new Error("query failed"),
  );

  const ctx = createContext();
  const runtime = createThemeSyncRuntime();
  const schedule = vi.fn(() => vi.fn());

  try {
    await runtime.setupAppearanceMonitoring(ctx, schedule);

    expect(schedule).not.toHaveBeenCalled();
    expect(runtime.getStatus(ctx).currentAppearance).toBe("unknown");
    expect(
      runtime
        .getStatus(ctx)
        .warnings.filter((warning) => warning.includes("query failed")),
    ).toHaveLength(3);
  } finally {
    runtime.cleanup();
  }
});

function createContext(): ExtensionContext {
  return {
    cwd: "/unused-detector-fallback-test",
    hasUI: true,
    mode: "tui",
    ui: {
      getAllThemes: () => [{ name: "light" }, { name: "dark" }],
      setTheme: vi.fn(),
      setWidget: vi.fn(),
      theme: { name: "initial" },
    },
  } as unknown as ExtensionContext;
}
