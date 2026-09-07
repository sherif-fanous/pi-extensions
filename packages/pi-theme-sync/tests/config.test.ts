import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CONFIG_PATHS, DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import type { LoadedConfig } from "../src/types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const availableThemeNames = ["light", "dark", "project-light", "global-dark"];

let testRoot: string;
let projectDirectory: string;

beforeEach(async () => {
  testRoot = await mkdtemp(path.join(tmpdir(), "pi-theme-sync-config-test-"));
  projectDirectory = path.join(testRoot, "project");
  CONFIG_PATHS.global = path.join(testRoot, "home", ".pi", "theme-sync.json");
});

afterEach(async () => {
  await rm(testRoot, { force: true, recursive: true });
});

describe("loadConfig", () => {
  test("uses valid project overrides and reports their source", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: 3000 },
        isSyncActive: false,
        themes: { dark: "global-dark", light: "light" },
      },
      {
        detection: { pollIntervalMs: 4000 },
        isSyncActive: true,
        themes: { dark: "dark", light: "project-light" },
      },
    );

    const result = await loadConfig(createContext());

    expect(result.runtimeConfig).toEqual({
      detection: { pollIntervalMs: 4000 },
      isSyncActive: true,
      themes: { dark: "dark", light: "project-light" },
    });

    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "project" },
      isSyncActive: "project",
      themes: { dark: "project", light: "project" },
    });
  });

  test("uses global values and defaults for missing values", async () => {
    await writeConfigs({ themes: { light: "project-light" } });

    const result = await loadConfig(createContext());

    expect(result.runtimeConfig).toEqual({
      ...DEFAULT_CONFIG,
      themes: { ...DEFAULT_CONFIG.themes, light: "project-light" },
    });

    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "default" },
      isSyncActive: "default",
      themes: { dark: "default", light: "global" },
    });
  });

  test("reports defaults when invalid project themes and interval fall back", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: 5000 },
        themes: { dark: "global-dark", light: "light" },
      },
      {
        detection: { pollIntervalMs: 999 },
        themes: { dark: "missing-dark", light: "missing-light" },
      },
    );

    const result = await loadConfig(createContext());

    expect(result.runtimeConfig.themes).toEqual(DEFAULT_CONFIG.themes);
    expect(result.runtimeConfig.detection).toEqual(DEFAULT_CONFIG.detection);
    expect(result.runtimeConfigSources.themes).toEqual({
      dark: "default",
      light: "default",
    });

    expect(result.runtimeConfigSources.detection.pollIntervalMs).toBe(
      "default",
    );
    expect(result.warnings).toHaveLength(3);
  });

  test("uses a valid global activation value after an invalid project value", async () => {
    await writeConfigs({ isSyncActive: false }, {
      isSyncActive: "invalid",
    } as unknown as LoadedConfig);

    const result = await loadConfig(createContext());

    expect(result.runtimeConfig.isSyncActive).toBe(false);
    expect(result.runtimeConfigSources.isSyncActive).toBe("global");
    expect(result.warnings).toEqual([
      'Project config: isSyncActive ""invalid"" is not a boolean — ignored',
    ]);
  });

  test("reports mixed project, global, and default sources", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: 3000 },
        themes: { dark: "global-dark" },
      },
      { themes: { light: "project-light" } },
    );

    const result = await loadConfig(createContext());

    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "global" },
      isSyncActive: "default",
      themes: { dark: "global", light: "project" },
    });
  });

  test("retains configured sources for valid values equal to defaults", async () => {
    await writeConfigs(
      { isSyncActive: true, themes: { dark: "dark" } },
      {
        detection: { pollIntervalMs: 2000 },
        themes: { light: "light" },
      },
    );

    const result = await loadConfig(createContext());

    expect(result.runtimeConfig).toEqual(DEFAULT_CONFIG);
    expect(result.runtimeConfigSources).toEqual({
      detection: { pollIntervalMs: "project" },
      isSyncActive: "global",
      themes: { dark: "global", light: "project" },
    });
  });

  test("treats null theme and interval values as absent", async () => {
    await writeConfigs(
      {
        detection: { pollIntervalMs: 3000 },
        isSyncActive: false,
        themes: { dark: "global-dark", light: "project-light" },
      },
      {
        detection: { pollIntervalMs: null },
        isSyncActive: null,
        themes: { dark: null, light: null },
      } as unknown as LoadedConfig,
    );

    const result = await loadConfig(createContext());

    expect(result.runtimeConfig).toMatchObject({
      detection: { pollIntervalMs: 3000 },
      isSyncActive: false,
      themes: { dark: "global-dark", light: "project-light" },
    });

    expect(result.runtimeConfigSources).toMatchObject({
      detection: { pollIntervalMs: "global" },
      isSyncActive: "global",
      themes: { dark: "global", light: "global" },
    });
    expect(result.warnings).toHaveLength(1);
  });
});

function createContext(): ExtensionContext {
  return {
    cwd: projectDirectory,
    ui: {
      getAllThemes: () => availableThemeNames.map((name) => ({ name })),
    },
  } as unknown as ExtensionContext;
}

async function writeConfigFile(
  filePath: string,
  config: LoadedConfig,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(config));
}

async function writeConfigs(
  globalConfig?: LoadedConfig,
  projectConfig?: LoadedConfig,
): Promise<void> {
  if (globalConfig) {
    await writeConfigFile(CONFIG_PATHS.global, globalConfig);
  }

  if (projectConfig) {
    await writeConfigFile(
      CONFIG_PATHS.project(projectDirectory),
      projectConfig,
    );
  }
}
