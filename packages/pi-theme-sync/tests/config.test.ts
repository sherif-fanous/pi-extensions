import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import {
  CONFIG_VERSION,
  DEFAULT_CONFIG,
  isValidPollIntervalMs,
  loadConfig,
  type LoadConfigContext,
} from "../src/config/load.js";
import { writeConfigChanges } from "../src/config/save.js";
import {
  configFileWarnings,
  type AtomicWriteFs,
  type ConfigFileFs,
  type ConfigScope,
} from "@sherif-fanous/pi-extensions-core";
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

      expect(result.warnings).toEqual([
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
    expect(result.warnings).toEqual([]);
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
    expect(result.warnings).toEqual([
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

    expect(result.warnings).toEqual([
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

    expect(result.warnings).toEqual([
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
    expect(result.warnings).toEqual([
      'Project setting "syncEnabled" must be a boolean, not "invalid". Ignored it.',
    ]);
  });

  test("uses the default sync value when no scope supplies a valid one", async () => {
    await writeConfigs({ syncEnabled: "no" }, { syncEnabled: "invalid" });

    const result = await load();

    expect(result.runtimeConfig.syncEnabled).toBe(true);
    expect(result.runtimeConfigSources.syncEnabled).toBe("default");
    expect(result.warnings).toEqual([
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

    expect(result.warnings).toEqual([
      'Project setting "syncEnabled" must be a boolean, not null. Ignored it.',
    ]);
  });

  test("reads the old isSyncActive key while syncEnabled is absent", async () => {
    await writeConfigs({ isSyncActive: false }, { isSyncActive: "no" });

    const result = await load();

    expect(result.runtimeConfig.syncEnabled).toBe(false);
    expect(result.runtimeConfigSources.syncEnabled).toBe("user");
    expect(result.warnings).toEqual([
      'Project setting "syncEnabled" must be a boolean, not "no". Ignored it.',
    ]);

    expect(result.files.user).toMatchObject({
      renamedKeys: ["isSyncActive"],
      state: "loaded",
    });
  });

  test("prefers syncEnabled over the old isSyncActive key in one file", async () => {
    await writeConfigs({ isSyncActive: true, syncEnabled: false });

    const result = await load();

    expect(result.runtimeConfig.syncEnabled).toBe(false);
  });

  test("reports each scope's file as loaded or missing", async () => {
    await writeConfigs({ syncEnabled: false });

    const { files, warnings } = await load();

    expect(files.user).toMatchObject({
      path: configPath("user"),
      scope: "user",
      state: "loaded",
    });

    expect(files.project).toEqual({
      path: configPath("project"),
      scope: "project",
      state: "missing",
    });
    expect(configFileWarnings([files.user, files.project])).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("skips a project file in an untrusted project and warns once", async () => {
    await writeConfigs(
      { themes: { dark: "user-dark" } },
      { syncEnabled: false, themes: { dark: "dark" } },
    );

    const { files, runtimeConfig, runtimeConfigSources, warnings } =
      await load(false);

    expect(runtimeConfig.syncEnabled).toBe(true);
    expect(runtimeConfig.themes.dark).toBe("user-dark");
    expect(runtimeConfigSources.themes.dark).toBe("user");
    expect(files.project.state).toBe("untrusted");
    expect(warnings).toEqual([]);
    expect(configFileWarnings([files.user, files.project])).toEqual([
      `Skipped project configuration at ${configPath("project")} because the project is not trusted. Trust the project to use it.`,
    ]);
  });

  test("stays silent in an untrusted project without a project file", async () => {
    const { files } = await load(false);

    expect(files.project.state).toBe("missing");
    expect(configFileWarnings([files.user, files.project])).toEqual([]);
  });

  test.each([
    { version: CONFIG_VERSION, loaded: true },
    { version: undefined, loaded: true },
    { version: 1, loaded: false },
    { version: 3, loaded: false },
    { version: "2", loaded: false },
  ])(
    "reads a file with version $version: $loaded",
    async ({ loaded, version }) => {
      await writeConfigs({ syncEnabled: false, version });

      const { files, runtimeConfig } = await load();

      expect(runtimeConfig.syncEnabled).toBe(!loaded);
      expect(files.user.state).toBe(loaded ? "loaded" : "invalid");

      if (!loaded) {
        expect(configFileWarnings([files.user])).toEqual([
          `Configuration at ${configPath("user")} has version ${JSON.stringify(version)}, but only version 2 is supported. Ignored the file.`,
        ]);
      }
    },
  );

  test.each(["{", "[]", "null", '"text"', "42", "true"])(
    "ignores a malformed file %s with its reason in the file state",
    async (content) => {
      await dirs.writeText(configPath("project"), content);

      const { files, runtimeConfig, warnings } = await load();

      expect(runtimeConfig).toEqual(DEFAULT_CONFIG);
      expect(warnings).toEqual([]);
      expect(files.project.state).toBe("invalid");

      const reason =
        files.project.state === "invalid" ? files.project.reason : "";
      const [warning] = configFileWarnings([files.project]);

      if (content === "{") {
        expect(reason).toMatch(/^not valid JSON: /);
        expect(warning).toMatch(/ is not valid JSON: .* Ignored the file\.$/);
      } else {
        expect(reason).toBe("not a JSON object");
        expect(warning).toBe(
          `Configuration at ${configPath("project")} must be a JSON object. Ignored the file.`,
        );
      }

      expect(warning).toContain(configPath("project"));
    },
  );

  test("ignores an unreadable file and uses the other scope", async () => {
    await writeConfigs(
      { themes: { dark: "user-dark" } },
      { themes: { dark: "dark" } },
    );

    const fs: ConfigFileFs = {
      access: async () => {},
      readFile: async (filePath, encoding) => {
        if (filePath === configPath("project")) {
          throw Object.assign(new Error("permission denied"), {
            code: "EACCES",
          });
        }

        return readFile(filePath, encoding);
      },
    };
    const { files, runtimeConfig } = await load(true, fs);

    expect(runtimeConfig.themes.dark).toBe("user-dark");
    expect(files.project).toMatchObject({
      reason: "unreadable: permission denied",
      state: "invalid",
    });

    expect(configFileWarnings([files.project])).toEqual([
      `Could not read configuration at ${configPath("project")}: permission denied. Ignored the file.`,
    ]);
  });

  test("does not read the old settings.json or theme-sync.json files", async () => {
    await dirs.writeJson(
      path.join(dirs.agentDir, "theme-sync", "settings.json"),
      { isSyncActive: false },
    );

    await dirs.writeJson(path.join(dirs.cwd, ".pi", "theme-sync.json"), {
      isSyncActive: false,
    });

    const { files, runtimeConfig } = await load();

    expect(runtimeConfig).toEqual(DEFAULT_CONFIG);
    expect([files.user.state, files.project.state]).toEqual([
      "missing",
      "missing",
    ]);
  });
});

describe("writeConfigChanges", () => {
  test.each(["project", "user"] as const)(
    "merges changes into the %s file with version first and other keys kept",
    async (scope) => {
      await dirs.writeJson(configPath(scope), {
        detection: { pollIntervalMs: 3000, strategy: "custom" },
        pluginSetting: { enabled: true },
        syncEnabled: true,
        themes: { dark: "user-dark", light: "light" },
      });

      await save(scope, {
        "detection.pollIntervalMs": 4500,
        syncEnabled: false,
        "themes.light": "project-light",
      });

      const text = await readFile(configPath(scope), "utf8");

      expect(JSON.parse(text)).toEqual({
        detection: { pollIntervalMs: 4500, strategy: "custom" },
        pluginSetting: { enabled: true },
        syncEnabled: false,
        themes: { dark: "user-dark", light: "project-light" },
        version: CONFIG_VERSION,
      });
      expect(Object.keys(JSON.parse(text) as object)[0]).toBe("version");
    },
  );

  test.each(["project", "user"] as const)(
    "creates a missing %s config.json with the current version",
    async (scope) => {
      await save(scope, { syncEnabled: false });

      expect(await dirs.readJson(configPath(scope))).toEqual({
        syncEnabled: false,
        version: CONFIG_VERSION,
      });
    },
  );

  test("renames the old isSyncActive key when it saves", async () => {
    await dirs.writeJson(configPath("user"), {
      isSyncActive: false,
      themes: { dark: "dark" },
    });

    await save("user", { "themes.light": "project-light" });

    expect(await dirs.readJson(configPath("user"))).toEqual({
      syncEnabled: false,
      themes: { dark: "dark", light: "project-light" },
      version: CONFIG_VERSION,
    });
  });

  test("rereads the file for each save", async () => {
    await save("project", { "themes.dark": "user-dark" });
    await dirs.writeJson(configPath("project"), {
      externalRevision: 2,
      themes: { dark: "external-dark" },
    });
    await save("project", { "themes.light": "project-light" });

    expect(await dirs.readJson(configPath("project"))).toEqual({
      externalRevision: 2,
      themes: { dark: "external-dark", light: "project-light" },
      version: CONFIG_VERSION,
    });
  });

  test("does not create a file when there are no changes", async () => {
    await save("project", {});

    expect(await dirs.exists(configPath("project"))).toBe(false);
  });

  test.each(["{", "[]", "null", '"text"', "42", "true"])(
    "refuses to overwrite a malformed file %s and saves after it is fixed",
    async (content) => {
      await dirs.writeText(configPath("user"), content);

      await expect(save("user", { syncEnabled: false })).rejects.toThrow(
        `${configPath("user")} is invalid (`,
      );
      expect(await readFile(configPath("user"), "utf8")).toBe(content);

      await dirs.writeText(configPath("user"), '{ "keepThis": true }');
      await save("user", { syncEnabled: false });

      expect(await dirs.readJson(configPath("user"))).toEqual({
        keepThis: true,
        syncEnabled: false,
        version: CONFIG_VERSION,
      });
    },
  );

  test("refuses to overwrite a file with another version", async () => {
    await dirs.writeJson(configPath("user"), { syncEnabled: true, version: 3 });

    await expect(save("user", { syncEnabled: false })).rejects.toThrow(
      `${configPath("user")} is invalid (unsupported version 3). Fix the file and try again.`,
    );

    expect(await dirs.readJson(configPath("user"))).toEqual({
      syncEnabled: true,
      version: 3,
    });
  });

  test("refuses to save to an untrusted project", async () => {
    await expect(
      save("project", { syncEnabled: false }, false),
    ).rejects.toThrow(
      `The project is not trusted, so ${configPath("project")} was not saved. Trust the project and try again.`,
    );
    expect(await dirs.exists(configPath("project"))).toBe(false);
  });

  test("saves to the User file in an untrusted project", async () => {
    await save("user", { syncEnabled: false }, false);

    expect(await dirs.readJson(configPath("user"))).toEqual({
      syncEnabled: false,
      version: CONFIG_VERSION,
    });
  });

  test("leaves the file unchanged when the write fails", async () => {
    await dirs.writeJson(configPath("project"), { syncEnabled: true });

    const atomicWriteFs: AtomicWriteFs = {
      mkdir,
      open,
      rename: () => Promise.reject(new Error("expected write failure")),
      unlink,
    };

    await expect(
      writeConfigChanges(
        "project",
        createProjectTrustContext(dirs.cwd, true),
        { syncEnabled: false },
        { agentDir: dirs.agentDir, atomicWriteFs },
      ),
    ).rejects.toThrow("expected write failure");

    expect(await dirs.readJson(configPath("project"))).toEqual({
      syncEnabled: true,
    });
  });
});

function configPath(scope: ConfigScope): string {
  return scope === "user"
    ? path.join(dirs.agentDir, "theme-sync", "config.json")
    : path.join(dirs.cwd, ".pi", "theme-sync", "config.json");
}

function createContext(trusted: boolean): LoadConfigContext {
  return {
    ...createProjectTrustContext(dirs.cwd, trusted),
    ui: {
      getAllThemes: () =>
        availableThemeNames.map((name) => ({ name, path: undefined })),
    },
  };
}

function load(trusted = true, fs?: ConfigFileFs) {
  return loadConfig(createContext(trusted), { agentDir: dirs.agentDir, fs });
}

function save(
  scope: ConfigScope,
  changes: Parameters<typeof writeConfigChanges>[2],
  trusted = true,
): Promise<void> {
  return writeConfigChanges(
    scope,
    createProjectTrustContext(dirs.cwd, trusted),
    changes,
    { agentDir: dirs.agentDir },
  );
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
