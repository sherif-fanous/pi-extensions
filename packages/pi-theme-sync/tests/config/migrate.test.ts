import { access, chmod, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { CONFIG_VERSION } from "../../src/config/load.js";
import {
  loadStartupConfig,
  migrateConfigLayout,
  type MigrationFs,
} from "../../src/config/migrate.js";
import type { ConfigScope } from "@sherif-fanous/pi-extensions-core";
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

  // A read-only directory fails the write; root ignores the permission.
  test.skipIf(process.getuid?.() === 0)(
    "keeps the old file when the write fails",
    async () => {
      await dirs.writeJson(settingsPath(scope), { isSyncActive: false });

      const directory = path.dirname(configPath(scope));

      await chmod(directory, 0o500);

      let result: Awaited<ReturnType<typeof migrate>>;

      try {
        result = await migrate();
      } finally {
        await chmod(directory, 0o700);
      }

      expect(result).toEqual({
        migrated: [],
        warnings: [
          expect.stringMatching(
            new RegExp(
              `^Could not migrate configuration at ${escapeRegExp(settingsPath(scope))}: .*permission denied.* Ignored the file\\.$`,
              "u",
            ),
          ),
        ],
      });
      expect(await dirs.exists(configPath(scope))).toBe(false);
      expect(await dirs.readJson(settingsPath(scope))).toEqual({
        isSyncActive: false,
      });
    },
  );

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

    expect(startup.outcome.migrated).toEqual([configPath("project")]);
    expect(startup.outcome.migrationWarnings).toEqual([]);
    expect(startup.runtimeConfig.syncEnabled).toBe(false);
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

    expect(startup.outcome.migrated).toEqual([configPath("user")]);
    expect(startup.outcome.files.user.state).toBe("loaded");
    expect(startup.runtimeConfig.syncEnabled).toBe(false);
    expect(startup.runtimeConfigSources.syncEnabled).toBe("user");
  });
});

function configPath(scope: ConfigScope): string {
  return path.join(scopeDir(scope), "theme-sync", "config.json");
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

function legacyPath(scope: ConfigScope): string {
  return path.join(scopeDir(scope), "theme-sync.json");
}

function migrate(trusted = true, fs?: MigrationFs) {
  return migrateConfigLayout(createProjectTrustContext(dirs.cwd, trusted), fs);
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

function startupConfig() {
  return loadStartupConfig({
    ...createProjectTrustContext(dirs.cwd, true),
    ui: { getAllThemes: () => [{ name: "dark", path: undefined }] },
  });
}
