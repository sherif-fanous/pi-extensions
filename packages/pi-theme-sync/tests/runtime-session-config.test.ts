import path from "node:path";

import { createThemeSyncRuntime } from "../src/runtime.js";
import { formatStatusReport } from "../src/ui/status-report.js";
import { fakePollingDetector } from "./helpers/fake-detectors.js";
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
  ]);

  expect(await dirs.readJson(userPath())).toEqual({
    syncEnabled: false,
    version: 2,
  });
  expect(session.status().syncEnabled).toBe(false);

  const again = await startSession(true);

  expect(again.notify).not.toHaveBeenCalled();
});

test("lists file warnings before invalid values and keeps file problems out of status warnings", async () => {
  await dirs.writeJson(userPath(), { syncEnabled: "no" });
  await dirs.writeJson(projectPath(), {});

  const session = await startSession(false);

  expect(session.notify).toHaveBeenCalledExactlyOnceWith(
    [
      "Theme Sync: 2 warnings",
      `- Skipped project configuration at ${projectPath()} because the project is not trusted. Trust the project to use it.`,
      '- User setting "syncEnabled" must be a boolean, not "no". Using the default value true.',
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
    warnings: [],
  });
});

test("stays silent in an untrusted project without a project file", async () => {
  const session = await startSession(false);

  expect(session.notify).not.toHaveBeenCalled();
  expect(formatStatusReport(session.status())).toContain(
    ["  Project: not found", `           ${projectPath()}`].join("\n"),
  );
});

function projectPath(): string {
  return path.join(dirs.cwd, ".pi", "theme-sync", "config.json");
}

function settingsPath(): string {
  return path.join(dirs.agentDir, "theme-sync", "settings.json");
}

async function startSession(trusted: boolean) {
  const notify = vi.fn();
  const setTheme = vi.fn();
  // The runtime reads only these members of the session context.
  const ctx: ExtensionContext = {
    cwd: dirs.cwd,
    hasUI: false,
    isProjectTrusted: () => trusted,
    mode: "print",
    ui: {
      getAllThemes: () => [{ name: "light" }, { name: "dark" }],
      notify,
      setTheme,
      theme: { name: "initial" },
    },
  } as never;
  const schedule = vi.fn(() => () => {});
  const runtime = createThemeSyncRuntime({
    detectors: {
      polling: [fakePollingDetector("System Appearance", "dark")],
      subscription: [],
    },
    schedule,
  });

  await runtime.startSession(ctx);
  runtime.dispose();

  return { notify, schedule, setTheme, status: () => runtime.getStatus(ctx) };
}

function userPath(): string {
  return path.join(dirs.agentDir, "theme-sync", "config.json");
}
