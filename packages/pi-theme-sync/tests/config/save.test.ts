import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { CONFIG_VERSION } from "../../src/config/load.js";
import { writeConfigChanges } from "../../src/config/save.js";
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
