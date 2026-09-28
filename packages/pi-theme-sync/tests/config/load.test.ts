import path from "node:path";

import {
  DEFAULT_CONFIG,
  isValidPollIntervalMs,
  loadConfig,
  type LoadConfigContext,
} from "../../src/config/load.js";
import type { ConfigScope } from "@sherif-fanous/pi-extensions-core";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const availableThemeNames = ["light", "dark", "project-light", "user-dark"];

let dirs: TempConfigDirs;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("isValidPollIntervalMs", () => {
  test.each([1000, 2000, 60_000])("accepts %s milliseconds", (value) => {
    expect(isValidPollIntervalMs(value)).toBe(true);
  });

  test.each([999, 60_001, 2_147_483_648, Number.NaN, Infinity, -Infinity])(
    "rejects %s milliseconds",
    (value) => {
      expect(isValidPollIntervalMs(value)).toBe(false);
    },
  );
});

describe("loadConfig", () => {
  test.each(["project", "user"] as const)(
    "uses the default value and source for an oversized %s interval",
    async (scope) => {
      await dirs.writeJson(configPath(scope), {
        detection: { pollIntervalMs: 60_001 },
      });

      const result = await load();

      expect(result.runtimeConfig.detection.pollIntervalMs).toBe(2000);
      expect(result.runtimeConfigSources.detection.pollIntervalMs).toBe(
        "default",
      );

      expect(result.outcome.valueWarnings).toEqual([
        `${scope === "project" ? "Project" : "User"} setting "pollIntervalMs" must be a number between 1000 and 60000 milliseconds, not 60001. Using the default value 2000.`,
      ]);
    },
  );

  test("retains the maximum interval and its configured source", async () => {
    await writeConfigs(undefined, { detection: { pollIntervalMs: 60_000 } });

    const result = await load();

    expect(result.runtimeConfig.detection.pollIntervalMs).toBe(60_000);
    expect(result.runtimeConfigSources.detection.pollIntervalMs).toBe(
      "project",
    );
    expect(result.outcome.valueWarnings).toEqual([]);
  });

  test("uses valid project overrides and reports their source", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: 3000 },
        syncEnabled: false,
        themes: { dark: "user-dark", light: "light" },
      },
      {
        detection: { pollIntervalMs: 4000 },
        syncEnabled: true,
        themes: { dark: "dark", light: "project-light" },
      },
    );

    const result = await load();

    expect(result.runtimeConfig).toEqual({
      detection: { pollIntervalMs: 4000 },
      syncEnabled: true,
      themes: { dark: "dark", light: "project-light" },
    });

    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "project" },
      syncEnabled: "project",
      themes: { dark: "project", light: "project" },
    });
  });

  test("uses user values and defaults for missing values", async () => {
    await writeConfigs({ themes: { light: "project-light" } });

    const result = await load();

    expect(result.runtimeConfig).toEqual({
      ...DEFAULT_CONFIG,
      themes: { ...DEFAULT_CONFIG.themes, light: "project-light" },
    });

    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "default" },
      syncEnabled: "default",
      themes: { dark: "default", light: "user" },
    });
  });

  test("uses valid user themes and interval after invalid project values", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: 5000 },
        themes: { dark: "user-dark", light: "light" },
      },
      {
        detection: { pollIntervalMs: 999 },
        themes: { dark: "missing-dark", light: "missing-light" },
      },
    );

    const result = await load();

    expect(result.runtimeConfig.themes).toEqual({
      dark: "user-dark",
      light: "light",
    });
    expect(result.runtimeConfig.detection.pollIntervalMs).toBe(5000);
    expect(result.runtimeConfigSources.themes).toEqual({
      dark: "user",
      light: "user",
    });
    expect(result.runtimeConfigSources.detection.pollIntervalMs).toBe("user");
    expect(result.outcome.valueWarnings).toEqual([
      'Theme "missing-light" was not found in Pi. Ignored it.',
      'Theme "missing-dark" was not found in Pi. Ignored it.',
      'Project setting "pollIntervalMs" must be a number between 1000 and 60000 milliseconds, not 999. Ignored it.',
    ]);
  });

  test("ignores invalid user values when valid project values apply", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: 60_001 },
        syncEnabled: "no",
        themes: { dark: "missing-dark", light: "missing-light" },
      },
      {
        detection: { pollIntervalMs: 3000 },
        syncEnabled: false,
        themes: { dark: "user-dark", light: "project-light" },
      },
    );

    const result = await load();

    expect(result.runtimeConfig).toEqual({
      detection: { pollIntervalMs: 3000 },
      syncEnabled: false,
      themes: { dark: "user-dark", light: "project-light" },
    });

    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "project" },
      syncEnabled: "project",
      themes: { dark: "project", light: "project" },
    });

    expect(result.outcome.valueWarnings).toEqual([
      'User setting "syncEnabled" must be a boolean, not "no". Ignored it.',
      'Theme "missing-light" was not found in Pi. Ignored it.',
      'Theme "missing-dark" was not found in Pi. Ignored it.',
      'User setting "pollIntervalMs" must be a number between 1000 and 60000 milliseconds, not 60001. Ignored it.',
    ]);
  });

  test("uses default themes and interval when no scope supplies a valid one", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: "3000" },
        themes: { dark: 42, light: "user-missing" },
      },
      {
        detection: { pollIntervalMs: 999 },
        themes: { dark: "missing-dark", light: "missing-light" },
      },
    );

    const result = await load();

    expect(result.runtimeConfig).toEqual(DEFAULT_CONFIG);
    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "default" },
      syncEnabled: "default",
      themes: { dark: "default", light: "default" },
    });

    expect(result.outcome.valueWarnings).toEqual([
      'Theme "missing-light" was not found in Pi. Using the default theme "light".',
      'Theme "user-missing" was not found in Pi. Using the default theme "light".',
      'Theme "missing-dark" was not found in Pi. Using the default theme "dark".',
      'Theme 42 was not found in Pi. Using the default theme "dark".',
      'Project setting "pollIntervalMs" must be a number between 1000 and 60000 milliseconds, not 999. Using the default value 2000.',
      'User setting "pollIntervalMs" must be a number between 1000 and 60000 milliseconds, not "3000". Using the default value 2000.',
    ]);
  });

  test("uses a valid user sync value after an invalid project value", async () => {
    await writeConfigs({ syncEnabled: false }, { syncEnabled: "invalid" });

    const result = await load();

    expect(result.runtimeConfig.syncEnabled).toBe(false);
    expect(result.runtimeConfigSources.syncEnabled).toBe("user");
    expect(result.outcome.valueWarnings).toEqual([
      'Project setting "syncEnabled" must be a boolean, not "invalid". Ignored it.',
    ]);
  });

  test("uses the default sync value when no scope supplies a valid one", async () => {
    await writeConfigs({ syncEnabled: "no" }, { syncEnabled: "invalid" });

    const result = await load();

    expect(result.runtimeConfig.syncEnabled).toBe(true);
    expect(result.runtimeConfigSources.syncEnabled).toBe("default");
    expect(result.outcome.valueWarnings).toEqual([
      'Project setting "syncEnabled" must be a boolean, not "invalid". Using the default value true.',
      'User setting "syncEnabled" must be a boolean, not "no". Using the default value true.',
    ]);
  });

  test("reports mixed project, user, and default sources", async () => {
    await writeConfigs(
      { detection: { pollIntervalMs: 3000 }, themes: { dark: "user-dark" } },
      { themes: { light: "project-light" } },
    );

    const result = await load();

    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "user" },
      syncEnabled: "default",
      themes: { dark: "user", light: "project" },
    });
  });

  test("retains configured sources for valid values equal to defaults", async () => {
    await writeConfigs(
      { syncEnabled: true, themes: { dark: "dark" } },
      { detection: { pollIntervalMs: 2000 }, themes: { light: "light" } },
    );

    const result = await load();

    expect(result.runtimeConfig).toEqual(DEFAULT_CONFIG);
    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "project" },
      syncEnabled: "user",
      themes: { dark: "user", light: "project" },
    });
  });

  test("treats null theme and interval values as absent", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: 3000 },
        syncEnabled: false,
        themes: { dark: "user-dark", light: "project-light" },
      },
      {
        detection: { pollIntervalMs: null },
        syncEnabled: null,
        themes: { dark: null, light: null },
      },
    );

    const result = await load();

    expect(result.runtimeConfig).toEqual({
      detection: { pollIntervalMs: 3000 },
      syncEnabled: false,
      themes: { dark: "user-dark", light: "project-light" },
    });

    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "user" },
      syncEnabled: "user",
      themes: { dark: "user", light: "user" },
    });

    expect(result.outcome.valueWarnings).toEqual([
      'Project setting "syncEnabled" must be a boolean, not null. Ignored it.',
    ]);
  });

  test("reads the old isSyncActive key while syncEnabled is absent", async () => {
    await writeConfigs({ isSyncActive: false }, { isSyncActive: "no" });

    const result = await load();

    expect(result.runtimeConfig.syncEnabled).toBe(false);
    expect(result.runtimeConfigSources.syncEnabled).toBe("user");
    expect(result.outcome.valueWarnings).toEqual([
      'Project setting "syncEnabled" must be a boolean, not "no". Ignored it.',
    ]);

    expect(result.outcome.files.user).toMatchObject({
      renamedKeys: ["isSyncActive"],
      state: "loaded",
    });
  });

  test("does not read the old settings.json or theme-sync.json files", async () => {
    await dirs.writeJson(
      path.join(dirs.agentDir, "theme-sync", "settings.json"),
      { isSyncActive: false },
    );

    await dirs.writeJson(path.join(dirs.cwd, ".pi", "theme-sync.json"), {
      isSyncActive: false,
    });

    const { outcome, runtimeConfig } = await load();

    expect(runtimeConfig).toEqual(DEFAULT_CONFIG);
    expect([outcome.files.user.state, outcome.files.project.state]).toEqual([
      "missing",
      "missing",
    ]);
  });
});

function configPath(scope: ConfigScope): string {
  return scope === "user"
    ? path.join(dirs.agentDir, "theme-sync", "config.json")
    : path.join(dirs.cwd, ".pi", "theme-sync", "config.json");
}

function createContext(): LoadConfigContext {
  return {
    ...createProjectTrustContext(dirs.cwd, true),
    ui: {
      getAllThemes: () =>
        availableThemeNames.map((name) => ({ name, path: undefined })),
    },
  };
}

function load() {
  return loadConfig(createContext());
}

async function writeConfigs(
  userConfig?: Record<string, unknown>,
  projectConfig?: Record<string, unknown>,
): Promise<void> {
  if (userConfig) await dirs.writeJson(configPath("user"), userConfig);

  if (projectConfig) {
    await dirs.writeJson(configPath("project"), projectConfig);
  }
}
