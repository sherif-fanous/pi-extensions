import { access, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { CONFIG_VERSION } from "../../src/config/load.js";
import {
  loadStartupConfig,
  migrateConfigLayout,
  type MigrationFs,
} from "../../src/config/migrate.js";
import type {
  AtomicWriteFs,
  ConfigScope,
} from "@sherif-fanous/pi-extensions-core";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

let dirs: TempConfigDirs;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
});

afterEach(async () => {
  await dirs.cleanup();
});

describe.each(["user", "project"] as const)("%s scope", (scope) => {
  test("moves settings.json to config.json with the key renamed and version first", async () => {
    await dirs.writeJson(settingsPath(scope), {
      detection: { pollIntervalMs: 3000 },
      isSyncActive: false,
      themes: { light: "light" },
    });

    const result = await migrate();

    expect(result).toEqual({ migrated: [configPath(scope)], warnings: [] });

    const text = await readFile(configPath(scope), "utf8");

    expect(JSON.parse(text)).toEqual({
      detection: { pollIntervalMs: 3000 },
      syncEnabled: false,
      themes: { light: "light" },
      version: CONFIG_VERSION,
    });
    expect(Object.keys(JSON.parse(text) as object)[0]).toBe("version");
    expect(await dirs.exists(settingsPath(scope))).toBe(false);
  });

  test("moves theme-sync.json when settings.json is missing", async () => {
    await dirs.writeJson(legacyPath(scope), { themes: { dark: "dark" } });

    expect(await migrate()).toEqual({
      migrated: [configPath(scope)],
      warnings: [],
    });

    expect(await dirs.readJson(configPath(scope))).toEqual({
      themes: { dark: "dark" },
      version: CONFIG_VERSION,
    });
    expect(await dirs.exists(legacyPath(scope))).toBe(false);
  });

  test("moves only settings.json when both old files exist", async () => {
    await dirs.writeJson(settingsPath(scope), { themes: { dark: "dark" } });
    await dirs.writeJson(legacyPath(scope), { themes: { dark: "light" } });

    await migrate();

    expect(await dirs.readJson(configPath(scope))).toEqual({
      themes: { dark: "dark" },
      version: CONFIG_VERSION,
    });
    expect(await dirs.exists(settingsPath(scope))).toBe(false);
    expect(await dirs.readJson(legacyPath(scope))).toEqual({
      themes: { dark: "light" },
    });
  });

  test.each([
    { name: "valid", text: '{ "themes": { "dark": "dark" } }' },
    { name: "malformed", text: "{" },
  ])(
    "leaves every file alone when a $name config.json exists",
    async ({ text }) => {
      await dirs.writeText(configPath(scope), text);
      await dirs.writeJson(settingsPath(scope), { isSyncActive: false });

      expect(await migrate()).toEqual({ migrated: [], warnings: [] });
      expect(await readFile(configPath(scope), "utf8")).toBe(text);
      expect(await dirs.readJson(settingsPath(scope))).toEqual({
        isSyncActive: false,
      });
    },
  );

  test.each([
    {
      message: /: The file is not valid JSON \(.+\)\. Ignored the file\.$/,
      text: "{",
    },
    {
      message: /: The file is not a JSON object\. Ignored the file\.$/,
      text: "[]",
    },
  ])(
    "warns about a malformed old file $text and migrates nothing in the scope",
    async ({ message, text }) => {
      await dirs.writeText(settingsPath(scope), text);
      await dirs.writeJson(legacyPath(scope), { isSyncActive: false });

      const result = await migrate();

      expect(result.migrated).toEqual([]);
      expect(result.warnings).toEqual([expect.stringMatching(message)]);
      expect(result.warnings[0]).toContain(
        `Could not migrate configuration at ${settingsPath(scope)}: `,
      );
      expect(await dirs.exists(configPath(scope))).toBe(false);
      expect(await readFile(settingsPath(scope), "utf8")).toBe(text);
      expect(await dirs.exists(legacyPath(scope))).toBe(true);
    },
  );

  test("warns about an unreadable old file and migrates nothing in the scope", async () => {
    await dirs.writeJson(settingsPath(scope), { isSyncActive: false });
    await dirs.writeJson(legacyPath(scope), { isSyncActive: false });

    const result = await migrate(true, {
      ...realFs(),
      readFile: async (filePath, encoding) => {
        if (filePath === settingsPath(scope)) {
          throw Object.assign(new Error("permission denied"), {
            code: "EACCES",
          });
        }

        return readFile(filePath, encoding);
      },
    });

    expect(result).toEqual({
      migrated: [],
      warnings: [
        `Could not migrate configuration at ${settingsPath(scope)}: permission denied. Ignored the file.`,
      ],
    });
    expect(await dirs.exists(configPath(scope))).toBe(false);
    expect(await dirs.exists(legacyPath(scope))).toBe(true);
  });

  test("keeps the old file when the write fails", async () => {
    await dirs.writeJson(settingsPath(scope), { isSyncActive: false });

    const result = await migrate(true, {
      ...realFs(),
      atomicWriteFs: failingWriteFs(),
    });

    expect(result).toEqual({
      migrated: [],
      warnings: [
        `Could not migrate configuration at ${settingsPath(scope)}: expected write failure. Ignored the file.`,
      ],
    });
    expect(await dirs.exists(configPath(scope))).toBe(false);
    expect(await dirs.readJson(settingsPath(scope))).toEqual({
      isSyncActive: false,
    });
  });

  test("warns when it cannot delete the old file after the write", async () => {
    await dirs.writeJson(settingsPath(scope), { isSyncActive: false });

    const result = await migrate(true, {
      ...realFs(),
      unlink: () =>
        Promise.reject(
          Object.assign(new Error("read-only file system"), { code: "EROFS" }),
        ),
    });

    expect(result).toEqual({
      migrated: [configPath(scope)],
      warnings: [
        `Created ${configPath(scope)} but could not remove ${settingsPath(scope)}: read-only file system. Delete it by hand.`,
      ],
    });

    expect(await dirs.readJson(configPath(scope))).toEqual({
      syncEnabled: false,
      version: CONFIG_VERSION,
    });
  });
});

test("migrates both scopes in one pass, User first", async () => {
  await dirs.writeJson(settingsPath("project"), { isSyncActive: true });
  await dirs.writeJson(legacyPath("user"), { isSyncActive: false });

  expect(await migrate()).toEqual({
    migrated: [configPath("user"), configPath("project")],
    warnings: [],
  });
});

test("leaves old project files alone in an untrusted project", async () => {
  await dirs.writeJson(settingsPath("project"), { isSyncActive: false });
  await dirs.writeJson(settingsPath("user"), { isSyncActive: false });

  expect(await migrate(false)).toEqual({
    migrated: [configPath("user")],
    warnings: [],
  });
  expect(await dirs.exists(configPath("project"))).toBe(false);
  expect(await dirs.readJson(settingsPath("project"))).toEqual({
    isSyncActive: false,
  });
});

test("does nothing when there are no old files", async () => {
  expect(await migrate()).toEqual({ migrated: [], warnings: [] });
  expect(await dirs.exists(configPath("user"))).toBe(false);
  expect(await dirs.exists(configPath("project"))).toBe(false);
});

describe("loadStartupConfig", () => {
  test("rewrites a config.json with the old isSyncActive key and loads it", async () => {
    await dirs.writeJson(configPath("project"), {
      isSyncActive: false,
      themes: { dark: "dark" },
    });

    const startup = await startupConfig();

    expect(startup.migrated).toEqual([configPath("project")]);
    expect(startup.warnings).toEqual([]);
    expect(startup.config.runtimeConfig.syncEnabled).toBe(false);
    expect(await dirs.readJson(configPath("project"))).toEqual({
      syncEnabled: false,
      themes: { dark: "dark" },
      version: CONFIG_VERSION,
    });
  });

  test("moves an old file and then loads the new one", async () => {
    await dirs.writeJson(settingsPath("user"), {
      isSyncActive: false,
      themes: { dark: "dark" },
    });

    const startup = await startupConfig();

    expect(startup.migrated).toEqual([configPath("user")]);
    expect(startup.config.files.user.state).toBe("loaded");
    expect(startup.config.runtimeConfig.syncEnabled).toBe(false);
    expect(startup.config.runtimeConfigSources.syncEnabled).toBe("user");
  });

  test("keeps the old key working for the session when the rewrite fails", async () => {
    await dirs.writeJson(configPath("user"), { isSyncActive: false });

    const startup = await startupConfig(true, {
      ...realFs(),
      atomicWriteFs: failingWriteFs(),
    });

    expect(startup.migrated).toEqual([]);
    expect(startup.warnings).toEqual([
      `Could not migrate configuration at ${configPath("user")}: expected write failure. Left the file unchanged.`,
    ]);
    expect(startup.config.runtimeConfig.syncEnabled).toBe(false);
    expect(await dirs.readJson(configPath("user"))).toEqual({
      isSyncActive: false,
    });
  });

  test("does not rewrite a project file in an untrusted project", async () => {
    await dirs.writeJson(configPath("project"), { isSyncActive: false });

    const startup = await startupConfig(false);

    expect(startup.migrated).toEqual([]);
    expect(startup.config.files.project.state).toBe("untrusted");
    expect(await dirs.readJson(configPath("project"))).toEqual({
      isSyncActive: false,
    });
  });

  test("leaves a current config.json alone", async () => {
    await dirs.writeJson(configPath("user"), { syncEnabled: false });

    const startup = await startupConfig();

    expect(startup.migrated).toEqual([]);
    expect(await dirs.readJson(configPath("user"))).toEqual({
      syncEnabled: false,
    });
  });
});

function configPath(scope: ConfigScope): string {
  return path.join(scopeDir(scope), "theme-sync", "config.json");
}

function failingWriteFs(): AtomicWriteFs {
  return {
    mkdir,
    open,
    rename: () => Promise.reject(new Error("expected write failure")),
    unlink,
  };
}

function legacyPath(scope: ConfigScope): string {
  return path.join(scopeDir(scope), "theme-sync.json");
}

function migrate(trusted = true, fs?: MigrationFs) {
  return migrateConfigLayout(createProjectTrustContext(dirs.cwd, trusted), {
    agentDir: dirs.agentDir,
    fs,
  });
}

function realFs(): MigrationFs {
  return {
    access,
    readFile: (filePath, encoding) => readFile(filePath, encoding),
    unlink,
  };
}

function scopeDir(scope: ConfigScope): string {
  return scope === "user" ? dirs.agentDir : path.join(dirs.cwd, ".pi");
}

function settingsPath(scope: ConfigScope): string {
  return path.join(scopeDir(scope), "theme-sync", "settings.json");
}

function startupConfig(trusted = true, fs?: MigrationFs) {
  return loadStartupConfig(
    {
      ...createProjectTrustContext(dirs.cwd, trusted),
      ui: { getAllThemes: () => [{ name: "dark", path: undefined }] },
    },
    { agentDir: dirs.agentDir, fs },
  );
}
