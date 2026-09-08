import { promises as fs } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CONFIG_PATHS,
  DEFAULT_CONFIG,
  isValidPollIntervalMs,
  loadConfig,
  writeConfigChanges,
} from "../src/config.js";
import type { ConfigScope, LoadedConfig } from "../src/types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
  test.each(["project", "global"] as const)(
    "uses default value and source for an oversized %s interval",
    async (scope) => {
      await writeConfigFile(getConfigFilePath(scope), {
        detection: { pollIntervalMs: 60_001 },
      });

      const result = await loadConfig(createContext());

      expect(result.runtimeConfig.detection.pollIntervalMs).toBe(2000);
      expect(result.runtimeConfigSources.detection.pollIntervalMs).toBe(
        "default",
      );

      expect(result.warnings).toEqual([
        `${scope === "project" ? "Project" : "Global"} config: pollIntervalMs "60001" must be a number between 1000 and 60000 milliseconds. Using default (2000ms).`,
      ]);
    },
  );

  test("retains the maximum interval and its configured source", async () => {
    await writeConfigs(undefined, { detection: { pollIntervalMs: 60_000 } });

    const result = await loadConfig(createContext());

    expect(result.runtimeConfig.detection.pollIntervalMs).toBe(60_000);
    expect(result.runtimeConfigSources.detection.pollIntervalMs).toBe(
      "project",
    );
    expect(result.warnings).toEqual([]);
  });

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

describe("writeConfigChanges", () => {
  test.each([
    { scope: "project" as const, targetName: "project" },
    { scope: "global" as const, targetName: "global" },
  ])(
    "writes multiple changes to the $targetName target with one read and write",
    async ({ scope }) => {
      const filePath = getConfigFilePath(scope);
      const existingConfig = {
        detection: { pollIntervalMs: 3000, strategy: "custom" },
        isSyncActive: true,
        pluginSetting: { enabled: true },
        themes: { dark: "global-dark", light: "light" },
      };

      await writeConfigFile(filePath, existingConfig);

      const readSpy = vi.spyOn(fs, "readFile");
      const writeSpy = vi.spyOn(fs, "writeFile");

      try {
        const result = await writeConfigChanges(scope, projectDirectory, {
          "detection.pollIntervalMs": 4500,
          "themes.light": "project-light",
          isSyncActive: false,
        });

        expect(result).toEqual({ ok: true });
        expect(readSpy).toHaveBeenCalledTimes(1);
        expect(writeSpy).toHaveBeenCalledTimes(1);
        expect(await readJson(filePath)).toEqual({
          detection: { pollIntervalMs: 4500, strategy: "custom" },
          isSyncActive: false,
          pluginSetting: { enabled: true },
          themes: { dark: "global-dark", light: "project-light" },
        });
      } finally {
        readSpy.mockRestore();
        writeSpy.mockRestore();
      }
    },
  );

  test("rereads the selected file for each batch write", async () => {
    const filePath = CONFIG_PATHS.project(projectDirectory);

    await writeConfigFile(filePath, {
      themes: { dark: "dark", light: "light" },
    });

    await writeConfigChanges("project", projectDirectory, {
      "themes.dark": "global-dark",
    });

    await writeFile(
      filePath,
      JSON.stringify({
        externalRevision: 2,
        themes: { dark: "external-dark" },
      }),
    );

    await writeConfigChanges("project", projectDirectory, {
      "themes.light": "project-light",
    });

    expect(await readJson(filePath)).toEqual({
      externalRevision: 2,
      themes: { dark: "external-dark", light: "project-light" },
    });
  });

  test("does no filesystem work when there are no changes", async () => {
    const readSpy = vi.spyOn(fs, "readFile");
    const writeSpy = vi.spyOn(fs, "writeFile");

    try {
      expect(await writeConfigChanges("project", projectDirectory, {})).toEqual(
        { ok: true },
      );

      expect(readSpy).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      readSpy.mockRestore();
      writeSpy.mockRestore();
    }
  });

  test.each(["project", "global"] as const)(
    "preserves invalid JSON in %s and permits retry after repair",
    async (scope) => {
      const filePath = getConfigFilePath(scope);
      const malformedContents = '{ "keepThis": true,\n';
      const changes = { isSyncActive: false };

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, malformedContents);

      const writeSpy = vi.spyOn(fs, "writeFile");

      try {
        expect(
          await writeConfigChanges(scope, projectDirectory, changes),
        ).toEqual({
          ok: false,
          reason: `Theme Sync did not change the ${scope} config file at ${filePath}. It must contain a valid JSON object. Fix the file and try again.`,
        });
        expect(writeSpy).not.toHaveBeenCalled();
        expect(await readFile(filePath, "utf8")).toBe(malformedContents);

        await writeFile(filePath, '{ "keepThis": true }');
        writeSpy.mockClear();

        expect(
          await writeConfigChanges(scope, projectDirectory, changes),
        ).toEqual({ ok: true });
        expect(writeSpy).toHaveBeenCalledTimes(1);
        expect(await readJson(filePath)).toEqual({
          isSyncActive: false,
          keepThis: true,
        });
      } finally {
        writeSpy.mockRestore();
      }
    },
  );

  test.each(
    (["project", "global"] as const).flatMap((scope) =>
      [
        "[]",
        '[{"keepThis":true}]',
        "null",
        '"settings"',
        "123",
        "true",
        "false",
      ].map((content) => ({ scope, content })),
    ),
  )(
    "rejects $scope config root $content without changing it",
    async ({ scope, content }) => {
      const filePath = getConfigFilePath(scope);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content);

      const loaded = await loadConfig(createContext());

      expect(loaded.runtimeConfig).toEqual(DEFAULT_CONFIG);
      expect(loaded.runtimeConfigSources.isSyncActive).toBe("default");
      expect(loaded.warnings).toEqual([
        `Configuration in ${filePath} must be a JSON object. File ignored.`,
      ]);

      const writeSpy = vi.spyOn(fs, "writeFile");

      try {
        expect(
          await writeConfigChanges(scope, projectDirectory, {
            isSyncActive: false,
          }),
        ).toEqual({
          ok: false,
          reason: `Theme Sync did not change the ${scope} config file at ${filePath}. It must contain a valid JSON object. Fix the file and try again.`,
        });
        expect(writeSpy).not.toHaveBeenCalled();
        expect(await readFile(filePath, "utf8")).toBe(content);

        await writeFile(filePath, "{}");
        writeSpy.mockClear();

        expect(
          await writeConfigChanges(scope, projectDirectory, {
            isSyncActive: false,
          }),
        ).toEqual({ ok: true });
        expect(writeSpy).toHaveBeenCalledOnce();
        expect(await readJson(filePath)).toEqual({ isSyncActive: false });
      } finally {
        writeSpy.mockRestore();
      }
    },
  );

  test.each(["project", "global"] as const)(
    "creates a missing %s config file",
    async (scope) => {
      expect(
        await writeConfigChanges(scope, projectDirectory, {
          isSyncActive: false,
        }),
      ).toEqual({ ok: true });

      expect(await readJson(getConfigFilePath(scope))).toEqual({
        isSyncActive: false,
      });
    },
  );

  test("reports a write failure after one attempted batch write", async () => {
    const filePath = CONFIG_PATHS.project(projectDirectory);

    await writeConfigFile(filePath, { isSyncActive: true });

    const readSpy = vi.spyOn(fs, "readFile");
    const writeSpy = vi
      .spyOn(fs, "writeFile")
      .mockRejectedValueOnce(new Error("expected write failure"));

    try {
      await expect(
        writeConfigChanges("project", projectDirectory, {
          "themes.light": "project-light",
          isSyncActive: false,
        }),
      ).rejects.toThrow("expected write failure");

      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledTimes(1);
    } finally {
      readSpy.mockRestore();
      writeSpy.mockRestore();
    }
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

function getConfigFilePath(scope: ConfigScope): string {
  return scope === "project"
    ? CONFIG_PATHS.project(projectDirectory)
    : CONFIG_PATHS.global;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
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
