import path from "node:path";

import { createThemeSyncRuntime } from "../src/runtime.js";
import { formatStatusReport } from "../src/ui/status-report.js";
import {
  fakePollingDetector,
  fakeSubscriptionDetector,
  type FakePollingDetector,
} from "./helpers/fake-detectors.js";
import {
  DEFAULT_DEPRECATION_NOTICE,
  deferralNotice,
  deprecationNotice,
} from "./helpers/notices.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

let dirs: TempConfigDirs;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
});

afterEach(async () => {
  await dirs.cleanup();
});

test("tells the user once which files session start migrated", async () => {
  await dirs.writeJson(settingsPath(), { isSyncActive: false });

  const session = await startSession(true);

  expect(session.notify.mock.calls).toEqual([
    [`Theme Sync migrated its configuration to ${userPath()}.`, "info"],
    [`Theme Sync: 1 warning\n- ${DEFAULT_DEPRECATION_NOTICE}`, "warning"],
  ]);

  expect(await dirs.readJson(userPath())).toEqual({
    syncEnabled: false,
    version: 2,
  });
  expect(session.status().syncEnabled).toBe(false);

  const again = await startSession(true);

  expect(again.notify).toHaveBeenCalledExactlyOnceWith(
    `Theme Sync: 1 warning\n- ${DEFAULT_DEPRECATION_NOTICE}`,
    "warning",
  );
});

test("lists file warnings before invalid values and keeps file problems out of status warnings", async () => {
  await dirs.writeJson(userPath(), { syncEnabled: "no" });
  await dirs.writeJson(projectPath(), {});

  const session = await startSession(false);

  expect(session.notify).toHaveBeenCalledExactlyOnceWith(
    [
      "Theme Sync: 3 warnings",
      `- Skipped project configuration at ${projectPath()} because the project is not trusted. Trust the project to use it.`,
      '- User setting "syncEnabled" must be a boolean, not "no". Using the default value true.',
      `- ${DEFAULT_DEPRECATION_NOTICE}`,
    ].join("\n"),
    "warning",
  );

  const report = formatStatusReport(session.status());

  expect(report).toContain(
    [
      "Config:",
      "  User:    loaded",
      `           ${userPath()}`,
      "  Project: skipped (untrusted)",
      `           ${projectPath()}`,
    ].join("\n"),
  );

  expect(session.status().warnings).toEqual([
    'User setting "syncEnabled" must be a boolean, not "no". Using the default value true.',
    DEFAULT_DEPRECATION_NOTICE,
  ]);
});

test("sync turned off detects the appearance once and applies no theme", async () => {
  await dirs.writeJson(userPath(), { syncEnabled: false, version: 2 });

  const session = await startSession(true);

  expect(session.schedule).not.toHaveBeenCalled();
  expect(session.setTheme).not.toHaveBeenCalled();
  expect(session.status()).toMatchObject({
    currentAppearance: "dark",
    desiredTheme: "dark",
    detectionStrategy: "Inactive",
    lastEvent: "Detected dark appearance",
    syncEnabled: false,
    warnings: [DEFAULT_DEPRECATION_NOTICE],
  });
});

test("stays silent in an untrusted project without a project file", async () => {
  const session = await startSession(false);

  expect(session.notify).toHaveBeenCalledExactlyOnceWith(
    `Theme Sync: 1 warning\n- ${DEFAULT_DEPRECATION_NOTICE}`,
    "warning",
  );

  expect(formatStatusReport(session.status())).toContain(
    ["  Project: not found", `           ${projectPath()}`].join("\n"),
  );
});

test("the deprecation notice names the effective theme mapping", async () => {
  await dirs.writeJson(userPath(), {
    themes: { dark: "catppuccin-macchiato", light: "catppuccin-latte" },
    version: 2,
  });

  const session = await startSession(true);

  expect(session.notify).toHaveBeenCalledExactlyOnceWith(
    `Theme Sync: 1 warning\n- ${deprecationNotice("catppuccin-latte", "catppuccin-macchiato")}`,
    "warning",
  );
});

test("the deprecation notice names light/dark without configuration files", async () => {
  const session = await startSession(true);

  expect(session.notify.mock.calls[0]?.[0]).toContain('"theme": "light/dark"');
});

test("the deprecation notice appears with sync off and applies no theme", async () => {
  await dirs.writeJson(userPath(), { syncEnabled: false, version: 2 });

  const session = await startSession(true);

  expect(session.notify).toHaveBeenCalledExactlyOnceWith(
    `Theme Sync: 1 warning\n- ${DEFAULT_DEPRECATION_NOTICE}`,
    "warning",
  );
  expect(session.setTheme).not.toHaveBeenCalled();
});

test("sync keeps applying the mapped theme after the notice", async () => {
  const session = await startSession(true);

  expect(session.notify.mock.calls[0]?.[0]).toContain(
    DEFAULT_DEPRECATION_NOTICE,
  );
  expect(session.setTheme).toHaveBeenCalledExactlyOnceWith("dark");
});

test("the notice follows invalid-value warnings and precedes detector warnings", async () => {
  await dirs.writeJson(userPath(), { syncEnabled: "no" });

  const failing = fakePollingDetector("System Appearance", "dark");

  failing.detect.mockRejectedValue(new Error("query failed"));

  const session = await startSession(true, { detectors: [failing] });

  expect(session.notify).toHaveBeenCalledExactlyOnceWith(
    [
      "Theme Sync: 5 warnings",
      '- User setting "syncEnabled" must be a boolean, not "no". Using the default value true.',
      `- ${DEFAULT_DEPRECATION_NOTICE}`,
      "- System Appearance query failed. Using the other available detectors.",
      "- No appearance detectors are available on this terminal.",
      "- Sync is on but the appearance is unknown. Did not apply a theme.",
    ].join("\n"),
    "warning",
  );

  expect(session.status().warnings).toEqual([
    'User setting "syncEnabled" must be a boolean, not "no". Using the default value true.',
    DEFAULT_DEPRECATION_NOTICE,
    "System Appearance query failed. Using the other available detectors.",
    "No appearance detectors are available on this terminal.",
    "Sync is on but the appearance is unknown. Did not apply a theme.",
  ]);
});

test.each([
  ["a/b", true],
  [" a / b ", true],
  ["a/b/c", false],
  ["light/", false],
  ["/dark", false],
  ["dark", false],
  [undefined, false],
])("Pi's theme setting %j defers: %s", async (themeSetting, defers) => {
  const session = await startSession(true, {
    readThemeSetting: () => themeSetting,
  });

  expect(session.status().lastEvent === "Deferred to Pi's theme setting").toBe(
    defers,
  );

  expect(session.notify.mock.calls[0]?.[0]).toContain(
    defers ? deferralNotice(themeSetting ?? "") : DEFAULT_DEPRECATION_NOTICE,
  );
});

test.each([true, false])(
  "deferring to Pi's theme pair probes and changes nothing with syncEnabled %s",
  async (syncEnabled) => {
    await dirs.writeJson(userPath(), { syncEnabled, version: 2 });

    const session = await startSession(true, {
      readThemeSetting: () => "latte/mocha",
      withSubscription: true,
    });

    expect(session.detector.detect).not.toHaveBeenCalled();
    expect(session.subscriptionDetector.isSupported).not.toHaveBeenCalled();
    expect(session.subscriptionDetector.subscribe).not.toHaveBeenCalled();
    expect(session.schedule).not.toHaveBeenCalled();
    expect(session.setTheme).not.toHaveBeenCalled();
    expect(session.notify).toHaveBeenCalledExactlyOnceWith(
      `Theme Sync: 1 warning\n- ${deferralNotice("latte/mocha")}`,
      "warning",
    );

    const report = formatStatusReport(session.status());

    expect(report).toMatch(/Sync:\s+off/);
    expect(report).toMatch(/Detection strategy:\s+Inactive/);
    expect(report).toMatch(/Desired theme:\s+none/);
    expect(report).toMatch(/Last event:\s+Deferred to Pi's theme setting/);
    expect(report).toContain(`Warnings:\n- ${deferralNotice("latte/mocha")}`);
    expect(session.status().warnings).toEqual([deferralNotice("latte/mocha")]);
    expect(session.status()).toMatchObject({
      currentAppearance: "unknown",
      desiredTheme: undefined,
      syncEnabled: false,
    });
  },
);

function projectPath(): string {
  return path.join(dirs.cwd, ".pi", "theme-sync", "config.json");
}

function settingsPath(): string {
  return path.join(dirs.agentDir, "theme-sync", "settings.json");
}

async function startSession(
  trusted: boolean,
  options: {
    detectors?: FakePollingDetector[];
    readThemeSetting?: () => string | undefined;
    withSubscription?: boolean;
  } = {},
) {
  const notify = vi.fn();
  const setTheme = vi.fn();
  // The runtime reads only these members of the session context.
  const ctx: ExtensionContext = {
    cwd: dirs.cwd,
    hasUI: false,
    isProjectTrusted: () => trusted,
    mode: "print",
    ui: {
      getAllThemes: () =>
        ["light", "dark", "catppuccin-latte", "catppuccin-macchiato"].map(
          (name) => ({ name }),
        ),
      notify,
      setTheme,
      theme: { name: "initial" },
    },
  } as never;
  const detector = fakePollingDetector("System Appearance", "dark");
  const subscriptionDetector = fakeSubscriptionDetector();
  const schedule = vi.fn(() => () => {});
  const runtime = createThemeSyncRuntime({
    detectors: {
      polling: options.detectors ?? [detector],
      subscription: options.withSubscription ? [subscriptionDetector] : [],
    },
    schedule,
    readThemeSetting: options.readThemeSetting,
  });

  await runtime.startSession(ctx);
  runtime.dispose();

  return {
    detector,
    notify,
    schedule,
    setTheme,
    status: () => runtime.getStatus(ctx),
    subscriptionDetector,
  };
}

function userPath(): string {
  return path.join(dirs.agentDir, "theme-sync", "config.json");
}
