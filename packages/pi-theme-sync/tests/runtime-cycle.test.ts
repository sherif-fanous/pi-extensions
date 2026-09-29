import type { DetectorSet } from "../src/detectors/index.js";
import { createThemeSyncRuntime } from "../src/runtime.js";
import type { Appearance } from "../src/types.js";
import {
  createRuntimeContext,
  fakePollingDetector,
  fakeSubscriptionDetector,
} from "./helpers/fake-detectors.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  createDeferred,
  createFakeContext,
  createPlainTheme,
  flushPromises,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, expect, test, vi } from "vitest";

/** A widget factory, as `ctx.ui.setWidget` receives it. */
type WidgetFactory = (tui: TUI, theme: Theme) => Component;

afterEach(() => {
  vi.restoreAllMocks();
});

test("the real detectors read terminal replies and subscribe to Pi's color scheme", async () => {
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const appliedThemes: string[] = [];
  const notifications: boolean[] = [];
  const theme = Object.assign(createPlainTheme(), { name: "initial" });
  let listener: ((appearance: Appearance) => void) | undefined;
  let listenerRemovals = 0;
  const tui = {
    onTerminalColorSchemeChange: (
      onChange: (appearance: Appearance) => void,
    ) => {
      listener = onChange;

      return () => {
        listenerRemovals += 1;
      };
    },
    queryTerminalColorScheme: () => Promise.resolve(undefined),
    setTerminalColorSchemeNotifications: (enabled: boolean) => {
      notifications.push(enabled);
    },
  } as unknown as TUI;
  const ctx = createFakeContext({
    cwd: "/unused-runtime-test",
    ui: {
      getAllThemes: () => [
        { name: "light", path: undefined },
        { name: "dark", path: undefined },
      ],
      onTerminalInput: (handler) => {
        // DECRQM reports DEC mode 2031 as set; OSC 11 reports a black background.
        queueMicrotask(() => {
          handler("\u001B[?2031;1$y\u001B]11;rgb:00/00/00\u001B\\");
        });

        return () => {};
      },
      setTheme: (themeName: string) => {
        appliedThemes.push(themeName);
        theme.name = themeName;

        return { success: true };
      },
      setWidget: (_key: string, factory?: string[] | WidgetFactory) => {
        if (typeof factory === "function") factory(tui, theme);
      },
      theme,
    },
  });
  const runtime = createThemeSyncRuntime({ schedule: () => () => {} });

  try {
    await runtime.startSession(ctx);

    const status = runtime.getStatus(ctx);

    expect(write).toHaveBeenCalledWith("\x1b]11;?\x1b\\");
    expect(write).toHaveBeenCalledWith("\x1b[?2031$p");
    expect(status).toMatchObject({
      currentAppearance: "dark",
      detectionStrategy: "Terminal Color Scheme (subscription)",
      warnings: [],
    });

    expect(status.availableDetectors.slice(0, 2)).toEqual([
      "Terminal Color Scheme (subscription)",
      "OSC 11",
    ]);
    expect(appliedThemes).toEqual(["dark"]);

    listener?.("light");
    expect(appliedThemes).toEqual(["dark", "light"]);
  } finally {
    runtime.dispose();
  }

  expect(listenerRemovals).toBe(1);
  expect(
    notifications,
    "dispose must not disable shared host notifications",
  ).toEqual([true]);
});

for (const mode of ["polling", "subscription"] as const) {
  test(`${mode} runtime excludes overlap, recovers after failure, and guards dispose`, async () => {
    const slowFailure = createDeferred<Appearance>();
    const repeatedFailure = createDeferred<Appearance>();
    const lateResult = createDeferred<Appearance>();
    const colorScheme = fakePollingDetector("Terminal Color Scheme");

    colorScheme.detect
      .mockResolvedValueOnce("light")
      .mockResolvedValueOnce("light")
      .mockReturnValueOnce(slowFailure.promise)
      .mockReturnValueOnce(repeatedFailure.promise)
      .mockResolvedValueOnce("dark")
      .mockReturnValueOnce(lateResult.promise);

    const session = await startRuntime({
      polling: [colorScheme],
      subscription: mode === "subscription" ? [fakeSubscriptionDetector()] : [],
    });

    try {
      expect(colorScheme.detect).toHaveBeenCalledTimes(2);

      session.runCycle();
      session.runCycle();
      expect(
        colorScheme.detect,
        "a slow cycle must exclude overlap",
      ).toHaveBeenCalledTimes(3);

      slowFailure.reject(new Error("expected recurring failure"));
      await flushPromises();
      expect(session.status().warnings).toEqual([
        "Terminal Color Scheme query failed. Using the other available detectors.",
      ]);

      session.runCycle();
      repeatedFailure.reject(new Error("expected repeated recurring failure"));
      await flushPromises();
      expect(
        colorScheme.detect,
        "a failure must release the cycle guard",
      ).toHaveBeenCalledTimes(4);

      expect(
        session
          .status()
          .warnings.filter((warning) => warning.includes("query failed")),
        "repeated detector failures must keep warnings bounded",
      ).toHaveLength(1);

      session.runCycle();
      await flushPromises();
      expect(session.status().currentAppearance).toBe("dark");

      session.runCycle();

      const appliedThemeCount = session.ctx.appliedThemes.length;

      session.runtime.dispose();
      lateResult.resolve("light");
      await flushPromises();
      expect(
        session.ctx.appliedThemes,
        "dispose must prevent a late theme update",
      ).toHaveLength(appliedThemeCount);
    } finally {
      session.runtime.dispose();
    }
  });
}

// The subscription cycle's drift check reads Pi's theme outside the guard
// around applying one, so a throwing theme reaches the cycle's failure
// handling. The polling cycle reads it only inside that guard.
test("recurring non-detector failures still release the cycle guard", async () => {
  const colorScheme = fakePollingDetector("Terminal Color Scheme", "light");
  const session = await startRuntime({
    polling: [colorScheme],
    subscription: [fakeSubscriptionDetector()],
  });
  const originalTheme = session.ctx.ui.theme;

  try {
    Object.defineProperty(session.ctx.ui, "theme", {
      configurable: true,
      get: () => {
        throw new Error("expected theme access failure");
      },
    });
    session.runCycle();
    await flushPromises();
    Object.defineProperty(session.ctx.ui, "theme", {
      configurable: true,
      value: originalTheme,
      writable: true,
    });

    expect(session.status().warnings).toEqual([
      "A recurring appearance update failed. Retrying on the next cycle.",
    ]);

    session.runCycle();
    await flushPromises();
    expect(colorScheme.detect).toHaveBeenCalledTimes(4);
    expect(session.status().currentAppearance).toBe("light");
  } finally {
    session.runtime.dispose();
  }
});

test("a subscription cycle reapplies the mapped theme after a manual change", async () => {
  const session = await startRuntime({
    polling: [fakePollingDetector("Terminal Color Scheme", "light")],
    subscription: [fakeSubscriptionDetector()],
  });

  try {
    Object.assign(session.ctx.ui.theme, { name: "chosen-by-hand" });
    session.runCycle();
    await flushPromises();

    expect(session.ctx.appliedThemes).toEqual(["light", "light"]);
    expect(session.status()).toMatchObject({
      appliedTheme: "light",
      currentAppearance: "light",
      detectionStrategy: "Terminal Color Scheme (subscription)",
      lastEvent: "Drift corrected: reapplied light theme",
    });
  } finally {
    session.runtime.dispose();
  }
});

test("subscription reports retain grace recovery and one-way demotion", async () => {
  const colorScheme = fakePollingDetector("Terminal Color Scheme");
  const subscription = fakeSubscriptionDetector();

  colorScheme.detect
    .mockResolvedValueOnce("light")
    .mockResolvedValueOnce("light")
    .mockResolvedValueOnce("dark")
    .mockResolvedValueOnce("light")
    .mockResolvedValueOnce("dark");

  const session = await startRuntime({
    polling: [colorScheme],
    subscription: [subscription],
  });

  try {
    session.runCycle();
    await flushPromises();

    subscription.report("dark");
    session.runCycle();
    await flushPromises();
    expect(session.status().detectionStrategy).toBe(
      "Terminal Color Scheme (subscription)",
    );

    expect(
      subscription.unsubscribe,
      "a report must recover the grace cycle",
    ).not.toHaveBeenCalled();

    session.runCycle();
    await flushPromises();

    const status = session.status();

    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(status.detectionStrategy).toBe("Terminal Color Scheme");
    expect(
      status.warnings.filter((warning) =>
        warning.includes("notifications stopped arriving"),
      ),
    ).toHaveLength(1);

    subscription.report("light");
    expect(
      session.status().detectionStrategy,
      "demotion must remain one-way",
    ).toBe("Terminal Color Scheme");
  } finally {
    session.runtime.dispose();
  }
});

test("demotion drops the subscription from status and polls the fallback chain", async () => {
  const colorScheme = fakePollingDetector("Terminal Color Scheme");
  const osc11 = fakePollingDetector("OSC 11", "light");
  const subscription = fakeSubscriptionDetector();

  colorScheme.detect
    .mockResolvedValueOnce("light")
    .mockResolvedValueOnce("light")
    .mockResolvedValueOnce("dark")
    .mockResolvedValueOnce("dark");

  const session = await startRuntime({
    polling: [colorScheme, osc11],
    subscription: [subscription],
  });

  try {
    expect(session.status().availableDetectors).toEqual([
      "Terminal Color Scheme (subscription)",
      "Terminal Color Scheme",
      "OSC 11",
    ]);

    session.runCycle();
    await flushPromises();
    session.runCycle();
    await flushPromises();

    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(session.status()).toMatchObject({
      availableDetectors: ["Terminal Color Scheme", "OSC 11"],
      currentAppearance: "dark",
      detectionStrategy: "Terminal Color Scheme",
      lastEvent: "Switched to polling after notifications stopped arriving",
      warnings: [
        "Terminal color-scheme notifications stopped arriving. Switched to polling.",
      ],
    });

    session.runCycle();
    await flushPromises();

    expect(session.ctx.appliedThemes).toEqual(["light", "dark", "light"]);
    expect(session.status()).toMatchObject({
      currentAppearance: "light",
      detectionStrategy: "OSC 11",
      lastEvent: "Detected light appearance",
      warnings: [
        "Terminal color-scheme notifications stopped arriving. Switched to polling.",
      ],
    });
  } finally {
    session.runtime.dispose();
  }
});

async function startRuntime(detectors: DetectorSet) {
  const ctx = createRuntimeContext();
  let cycle = () => {};
  const runtime = createThemeSyncRuntime({
    detectors,
    schedule: (scheduled) => {
      cycle = scheduled;

      return () => {};
    },
  });

  await runtime.startSession(ctx);

  return {
    ctx,
    runCycle: () => cycle(),
    runtime,
    status: () => runtime.getStatus(ctx),
  };
}
