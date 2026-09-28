import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createThemeSyncRuntime } from "../src/runtime.js";
import type { Appearance } from "../src/types.js";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  createDeferred,
  createFakeContext,
  createPlainTheme,
  flushPromises,
  type Deferred,
} from "@sherif-fanous/pi-extensions-testing";
import { assert, test } from "vitest";

type RuntimeHarness = {
  appliedThemes: string[];
  cleanup: () => Promise<void>;
  ctx: ExtensionContext;
  getColorSchemeQueryCount: () => number;
  getListenerRemovalCount: () => number;
  notifications: boolean[];
  reportAppearance: (appearance: Appearance) => void;
};

/** A widget factory, as `ctx.ui.setWidget` receives it. */
type WidgetFactory = (tui: TUI, theme: Theme) => Component;

async function createRuntimeHarness(
  mode: "polling" | "subscription",
  colorSchemeResults: Array<Appearance | Deferred<Appearance>>,
): Promise<RuntimeHarness> {
  const cwd = await mkdtemp(path.join(tmpdir(), "pi-theme-sync-test-"));

  await mkdir(path.join(cwd, ".pi", "theme-sync"), { recursive: true });
  await writeFile(
    path.join(cwd, ".pi", "theme-sync", "config.json"),
    JSON.stringify({
      syncEnabled: true,
      themes: { light: "light-theme", dark: "dark-theme" },
      detection: { pollIntervalMs: 1000 },
    }),
  );

  const appliedThemes: string[] = [];
  const notifications: boolean[] = [];
  const theme = Object.assign(createPlainTheme(), { name: "initial-theme" });
  let colorSchemeQueryCount = 0;
  let listenerRemovalCount = 0;
  let onAppearanceDetected: ((appearance: Appearance) => void) | undefined;

  const tui = {
    onTerminalColorSchemeChange: (
      listener: (appearance: Appearance) => void,
    ) => {
      onAppearanceDetected = listener;

      return () => {
        listenerRemovalCount += 1;
      };
    },
    queryTerminalColorScheme: () => {
      const result = colorSchemeResults[colorSchemeQueryCount];

      colorSchemeQueryCount += 1;

      return typeof result === "object"
        ? result.promise
        : Promise.resolve(result ?? "unknown");
    },
    setTerminalColorSchemeNotifications: (enabled: boolean) => {
      notifications.push(enabled);
    },
  } as unknown as TUI;

  const ctx = createFakeContext({
    cwd,
    ui: {
      getAllThemes: () =>
        [
          "light-theme",
          "dark-theme",
          "catppuccin-latte",
          "catppuccin-macchiato",
        ].map((name) => ({ name, path: undefined })),
      onTerminalInput: (handler) => {
        queueMicrotask(() => {
          handler(
            mode === "subscription"
              ? "\u001B[?2031;1$y\u001B]11;rgb:00/00/00\u001B\\"
              : "\u001B[?2031;0$y\u001B]11;rgb:00/00/00\u001B\\",
          );
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

  return {
    appliedThemes,
    cleanup: () => rm(cwd, { recursive: true, force: true }),
    ctx,
    getColorSchemeQueryCount: () => colorSchemeQueryCount,
    getListenerRemovalCount: () => listenerRemovalCount,
    notifications,
    reportAppearance: (appearance) => onAppearanceDetected?.(appearance),
  };
}

for (const mode of ["polling", "subscription"] as const) {
  void test(`${mode} runtime excludes overlap, recovers after failure, and guards dispose`, async () => {
    const slowFailure = createDeferred<Appearance>();
    const repeatedFailure = createDeferred<Appearance>();
    const lateResult = createDeferred<Appearance>();
    const harness = await createRuntimeHarness(mode, [
      "light",
      "light",
      slowFailure,
      repeatedFailure,
      "dark",
      lateResult,
    ]);
    const scheduledCycles: Array<() => void> = [];
    const runtime = createThemeSyncRuntime();

    try {
      await runtime.startSession(harness.ctx, (cycle) => {
        scheduledCycles.push(cycle);

        return () => {};
      });

      const runCycle = scheduledCycles[0];

      assert.ok(runCycle);
      assert.equal(harness.getColorSchemeQueryCount(), 2);

      runCycle();
      runCycle();
      assert.equal(
        harness.getColorSchemeQueryCount(),
        3,
        "a slow cycle must exclude overlap",
      );

      slowFailure.reject(new Error("expected recurring failure"));
      await flushPromises();
      assert.deepEqual(runtime.getStatus(harness.ctx).warnings, [
        "Terminal Color Scheme query failed. Using the other available detectors.",
      ]);

      runCycle();
      repeatedFailure.reject(new Error("expected repeated recurring failure"));
      await flushPromises();
      assert.equal(
        harness.getColorSchemeQueryCount(),
        4,
        "a failure must release the cycle guard",
      );

      assert.equal(
        runtime
          .getStatus(harness.ctx)
          .warnings.filter((warning) => warning.includes("query failed"))
          .length,
        1,
        "repeated detector failures must keep warnings bounded",
      );

      runCycle();
      await flushPromises();
      assert.equal(runtime.getStatus(harness.ctx).currentAppearance, "dark");

      runCycle();

      const appliedThemeCountBeforeCleanup = harness.appliedThemes.length;

      runtime.dispose();
      lateResult.resolve("light");
      await flushPromises();
      assert.equal(
        harness.appliedThemes.length,
        appliedThemeCountBeforeCleanup,
        "dispose must prevent a late theme update",
      );

      assert.deepEqual(
        harness.notifications,
        mode === "subscription" ? [true] : [],
        "dispose must not disable shared host notifications",
      );
    } finally {
      runtime.dispose();
      await harness.cleanup();
    }
  });
}

void test("recurring non-detector failures still release the cycle guard", async () => {
  const harness = await createRuntimeHarness("subscription", [
    "light",
    "light",
    "light",
    "light",
  ]);
  const runtime = createThemeSyncRuntime();
  const originalTheme = harness.ctx.ui.theme;
  let runCycle = () => {};

  try {
    await runtime.startSession(harness.ctx, (cycle) => {
      runCycle = cycle;

      return () => {};
    });

    Object.defineProperty(harness.ctx.ui, "theme", {
      configurable: true,
      get: () => {
        throw new Error("expected theme access failure");
      },
    });
    runCycle();
    await flushPromises();
    Object.defineProperty(harness.ctx.ui, "theme", {
      configurable: true,
      value: originalTheme,
      writable: true,
    });

    assert.deepEqual(runtime.getStatus(harness.ctx).warnings, [
      "A recurring appearance update failed. Retrying on the next cycle.",
    ]);

    runCycle();
    await flushPromises();
    assert.equal(harness.getColorSchemeQueryCount(), 4);
    assert.equal(runtime.getStatus(harness.ctx).currentAppearance, "light");
  } finally {
    runtime.dispose();
    await harness.cleanup();
  }
});

void test("subscription reports retain grace recovery and one-way demotion", async () => {
  const harness = await createRuntimeHarness("subscription", [
    "light",
    "light",
    "dark",
    "light",
    "dark",
  ]);
  const scheduledCycles: Array<() => void> = [];
  const runtime = createThemeSyncRuntime();

  try {
    await runtime.startSession(harness.ctx, (cycle) => {
      scheduledCycles.push(cycle);

      return () => {};
    });

    const runCycle = scheduledCycles[0];

    assert.ok(runCycle);
    runCycle();
    await flushPromises();

    harness.reportAppearance("dark");
    runCycle();
    await flushPromises();
    assert.equal(
      runtime.getStatus(harness.ctx).detectionStrategy,
      "Terminal Color Scheme (subscription)",
    );

    assert.equal(
      harness.getListenerRemovalCount(),
      0,
      "a report must recover the grace cycle",
    );

    runCycle();
    await flushPromises();

    const status = runtime.getStatus(harness.ctx);

    assert.equal(harness.getListenerRemovalCount(), 1);
    assert.equal(status.detectionStrategy, "Terminal Color Scheme");
    assert.equal(
      status.warnings.filter((warning) =>
        warning.includes("notifications stopped arriving"),
      ).length,
      1,
    );

    harness.reportAppearance("light");
    assert.equal(
      runtime.getStatus(harness.ctx).detectionStrategy,
      "Terminal Color Scheme",
      "demotion must remain one-way",
    );
    assert.deepEqual(harness.notifications, [true]);
  } finally {
    runtime.dispose();
    await harness.cleanup();
  }
});
