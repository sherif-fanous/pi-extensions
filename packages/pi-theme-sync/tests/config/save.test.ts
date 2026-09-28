import { readFile } from "node:fs/promises";
import path from "node:path";

import { CONFIG_VERSION } from "../../src/config/load.js";
import { writeConfigChanges } from "../../src/config/save.js";
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
});

function configPath(scope: ConfigScope): string {
  return scope === "user"
    ? path.join(dirs.agentDir, "theme-sync", "config.json")
    : path.join(dirs.cwd, ".pi", "theme-sync", "config.json");
}

function save(
  scope: ConfigScope,
  changes: Parameters<typeof writeConfigChanges>[2],
): Promise<void> {
  return writeConfigChanges(
    scope,
    createProjectTrustContext(dirs.cwd, true),
    changes,
  );
}
