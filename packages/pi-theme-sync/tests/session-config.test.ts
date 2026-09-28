import path from "node:path";

import { detectAppearanceViaColorScheme } from "../src/detectors/pi/color-scheme.js";
import { detectAppearanceViaSystem } from "../src/detectors/system/appearance.js";
import { probeDecMode2031Support } from "../src/detectors/terminal/dec-mode-2031.js";
import { detectAppearanceViaOsc11Background } from "../src/detectors/terminal/osc-11.js";
import { createThemeSyncRuntime } from "../src/runtime.js";
import { formatStatusReport } from "../src/ui/status-report.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
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

let dirs: TempConfigDirs;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  vi.stubEnv("PI_CODING_AGENT_DIR", dirs.agentDir);
  vi.mocked(detectAppearanceViaColorScheme).mockResolvedValue("dark");
  vi.mocked(detectAppearanceViaOsc11Background).mockResolvedValue("dark");
  vi.mocked(detectAppearanceViaSystem).mockResolvedValue("dark");
  vi.mocked(probeDecMode2031Support).mockResolvedValue("unsupported");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
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

test("warns about a skipped untrusted project file once, after migration warnings", async () => {
  await dirs.writeText(settingsPath(), "{");
  await dirs.writeJson(projectPath(), { syncEnabled: false });

  const session = await startSession(false);

  expect(session.notify).toHaveBeenCalledOnce();
  expect(session.notify.mock.calls[0]?.[1]).toBe("warning");

  const lines = String(session.notify.mock.calls[0]?.[0]).split("\n");

  expect(lines[0]).toBe("Theme Sync: 2 warnings");
  expect(lines[1]).toMatch(
    new RegExp(
      `^- Could not migrate configuration at ${escapeRegExp(settingsPath())}: The file is not valid JSON`,
    ),
  );

  expect(lines[2]).toBe(
    `- Skipped project configuration at ${projectPath()} because the project is not trusted. Trust the project to use it.`,
  );
  expect(session.status().syncEnabled).toBe(true);
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

test("stays silent in an untrusted project without a project file", async () => {
  const session = await startSession(false);

  expect(session.notify).not.toHaveBeenCalled();
  expect(formatStatusReport(session.status())).toContain(
    ["  Project: not found", `           ${projectPath()}`].join("\n"),
  );
});

function escapeRegExp(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

function projectPath(): string {
  return path.join(dirs.cwd, ".pi", "theme-sync", "config.json");
}

function settingsPath(): string {
  return path.join(dirs.agentDir, "theme-sync", "settings.json");
}

async function startSession(trusted: boolean) {
  const notify = vi.fn();
  // The runtime reads only these members of the session context.
  const ctx: ExtensionContext = {
    cwd: dirs.cwd,
    hasUI: false,
    isProjectTrusted: () => trusted,
    mode: "print",
    ui: {
      getAllThemes: () => [{ name: "light" }, { name: "dark" }],
      notify,
      setTheme: vi.fn(),
      theme: { name: "dark" },
    },
  } as never;
  const runtime = createThemeSyncRuntime();

  await runtime.setupAppearanceMonitoring(ctx, () => () => {});
  runtime.cleanup();

  return { notify, status: () => runtime.getStatus(ctx) };
}

function userPath(): string {
  return path.join(dirs.agentDir, "theme-sync", "config.json");
}
