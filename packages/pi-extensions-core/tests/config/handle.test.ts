/**
 * Covers the config handle against real temporary directories: where each
 * scope's file lives, project trust, versions, renamed keys, legacy file
 * names, saves, layout writes, and the startup key migration.
 */
import * as fsPromises from "node:fs/promises";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createConfigFileHandle,
  defineConfigFile,
} from "../../src/config/handle.js";
import { configScopeLabel, type ConfigFileHandle } from "../../src/index.js";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const DESCRIPTION = {
  extension: "theme-sync",
  extensionName: "Theme Sync",
  renamedKeys: [
    { from: "isSyncActive", to: "syncEnabled" },
    { from: "maxToastsVisible", to: "toast.maxVisible" },
    { from: "toast.timeout", to: "toast.timeoutMs" },
  ],
  scopes: ["user", "project"],
  version: 2,
} as const;

let dirs: TempConfigDirs;
let handle: ConfigFileHandle<"project" | "user">;
let userPath: string;
let projectPath: string;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  handle = defineConfigFile(DESCRIPTION);
  userPath = join(dirs.agentDir, "theme-sync", "config.json");
  projectPath = join(dirs.cwd, ".pi", "theme-sync", "config.json");
});

afterEach(async () => {
  await dirs.cleanup();
});

function context(trusted = true) {
  return createProjectTrustContext(dirs.cwd, trusted);
}

/** A file system whose rename fails, so every write fails after the temp file. */
function failingWriteHandle(): ConfigFileHandle<"project" | "user"> {
  return createConfigFileHandle(DESCRIPTION, {
    access: (path) => fsPromises.access(path),
    mkdir: fsPromises.mkdir,
    open: fsPromises.open,
    readFile: (path, encoding) => fsPromises.readFile(path, encoding),
    rename: () => Promise.reject(new Error("EROFS: read-only file system")),
    unlink: fsPromises.unlink,
  });
}

async function temporaryFiles(path: string): Promise<string[]> {
  const entries = await readdir(dirname(path));

  return entries.filter((entry) => entry.includes(".tmp."));
}

describe("path", () => {
  it("puts config.json in the extension's folder of Pi's agent directory and the project", () => {
    expect(handle.path(context(), "user")).toBe(userPath);
    expect(handle.path(context(), "project")).toBe(projectPath);
  });
});

describe("configScopeLabel", () => {
  it("names the scopes as Pi does", () => {
    expect(configScopeLabel("user")).toBe("User");
    expect(configScopeLabel("project")).toBe("Project");
  });
});

describe("load", () => {
  it("loads both scopes when the project is trusted", async () => {
    await dirs.writeJson(userPath, { version: 2, themes: { dark: "a" } });
    await dirs.writeJson(projectPath, { themes: { dark: "b" } });

    const { files } = await handle.load(context());

    expect(files.user).toEqual({
      data: { themes: { dark: "a" }, version: 2 },
      path: userPath,
      renamedKeys: [],
      scope: "user",
      state: "loaded",
    });

    expect(files.project).toMatchObject({
      data: { themes: { dark: "b" } },
      state: "loaded",
    });
  });

  it("skips an existing project file when the project is not trusted", async () => {
    await dirs.writeJson(userPath, {});
    await dirs.writeJson(projectPath, { syncEnabled: false });

    const { files } = await handle.load(context(false));

    expect(files.user.state).toBe("loaded");
    expect(files.project).toEqual({
      path: projectPath,
      scope: "project",
      state: "untrusted",
      warning: `Skipped project configuration at ${projectPath} because the project is not trusted. Trust the project to use it.`,
    });
  });

  it("stays silent about an untrusted project without a file", async () => {
    const { files } = await handle.load(context(false));

    expect(files.project).toEqual({
      path: projectPath,
      scope: "project",
      state: "missing",
    });
  });

  it("reads only the User scope without asking about trust", async () => {
    const userOnly = defineConfigFile({
      extension: "notification-center",
      extensionName: "Notification Center",
      scopes: ["user"],
      version: 2,
    });
    const ctx = {
      cwd: dirs.cwd,
      isProjectTrusted: (): boolean => {
        throw new Error("trust was checked");
      },
    };

    const { files } = await userOnly.load(ctx);

    expect(Object.keys(files)).toEqual(["user"]);
    expect(files.user.state).toBe("missing");
  });
});

describe("legacyFileNames", () => {
  const legacy = defineConfigFile({
    ...DESCRIPTION,
    extension: "presets-plus",
    legacyFileNames: ["presets.json"],
  });

  function paths() {
    const configPath = legacy.path(context(), "project");

    return {
      configPath,
      legacyPath: join(dirname(configPath), "presets.json"),
    };
  }

  it("reports a legacy file in an untrusted project without config.json as skipped", async () => {
    const { legacyPath } = paths();

    await dirs.writeJson(legacyPath, { version: 1, presets: [] });

    expect(await legacy.read(context(false), "project")).toEqual({
      path: legacyPath,
      scope: "project",
      state: "untrusted",
      warning: `Skipped project configuration at ${legacyPath} because the project is not trusted. Trust the project to use it.`,
    });
  });

  it("prefers config.json when both exist", async () => {
    const { configPath, legacyPath } = paths();

    await dirs.writeJson(configPath, {});
    await dirs.writeJson(legacyPath, {});

    expect(await legacy.read(context(false), "project")).toMatchObject({
      path: configPath,
      state: "untrusted",
    });
  });

  it("ignores legacy files in a trusted project", async () => {
    const { configPath, legacyPath } = paths();

    await dirs.writeJson(legacyPath, {});

    expect(await legacy.read(context(), "project")).toEqual({
      path: configPath,
      scope: "project",
      state: "missing",
    });
  });
});

describe("read", () => {
  it("reports a missing file without a warning", async () => {
    expect(await handle.read(context(), "user")).toEqual({
      path: userPath,
      scope: "user",
      state: "missing",
    });
  });

  it("treats a file without a version as the current version", async () => {
    await dirs.writeJson(userPath, { syncEnabled: true });

    expect(await handle.read(context(), "user")).toMatchObject({
      data: { syncEnabled: true },
      state: "loaded",
    });
  });

  it("ignores a file with a newer version", async () => {
    await dirs.writeJson(userPath, { syncEnabled: true, version: 3 });

    expect(await handle.read(context(), "user")).toEqual({
      path: userPath,
      reason: "unsupported version 3",
      scope: "user",
      state: "invalid",
      warning: `Configuration at ${userPath} has version 3, but only version 2 is supported. Ignored the file.`,
    });
  });

  it("writes a version that is not a number as JSON", async () => {
    await dirs.writeJson(userPath, { version: "2" });

    expect(await handle.read(context(), "user")).toMatchObject({
      reason: 'unsupported version "2"',
      state: "invalid",
      warning: `Configuration at ${userPath} has version "2", but only version 2 is supported. Ignored the file.`,
    });
  });

  it("reports invalid JSON with the parse error", async () => {
    await dirs.writeText(userPath, "{ nope");

    expect(await handle.read(context(), "user")).toMatchObject({
      reason: expect.stringMatching(/^not valid JSON: \S.*[^.]$/u) as unknown,
      state: "invalid",
      warning: expect.stringMatching(
        /^Configuration at .* is not valid JSON: .*[^.]\. Ignored the file\.$/u,
      ) as unknown,
    });
  });

  it.each(["[1, 2]", "null", '"x"'])(
    "reports %s as not a JSON object",
    async (text) => {
      await dirs.writeText(userPath, text);

      expect(await handle.read(context(), "user")).toEqual({
        path: userPath,
        reason: "not a JSON object",
        scope: "user",
        state: "invalid",
        warning: `Configuration at ${userPath} must be a JSON object. Ignored the file.`,
      });
    },
  );

  it("reports a file it could not read with one full stop", async () => {
    const unreadable = createConfigFileHandle(DESCRIPTION, {
      access: () => Promise.resolve(),
      mkdir: fsPromises.mkdir,
      open: fsPromises.open,
      readFile: () =>
        Promise.reject(
          Object.assign(new Error("EACCES: permission denied."), {
            code: "EACCES",
          }),
        ),
      rename: fsPromises.rename,
      unlink: fsPromises.unlink,
    });

    expect(await unreadable.read(context(), "user")).toEqual({
      path: userPath,
      reason: "unreadable: EACCES: permission denied",
      scope: "user",
      state: "invalid",
      warning: `Could not read configuration at ${userPath}: EACCES: permission denied. Ignored the file.`,
    });
  });

  it("reads a renamed key under its new name and lists the old one", async () => {
    await dirs.writeJson(userPath, { isSyncActive: false });

    expect(await handle.read(context(), "user")).toMatchObject({
      data: { syncEnabled: false },
      renamedKeys: ["isSyncActive"],
      state: "loaded",
    });
  });

  it("moves nested keys, creating the objects on the way", async () => {
    await dirs.writeJson(userPath, {
      maxToastsVisible: 3,
      toast: { position: "top", timeout: 5000 },
    });

    expect(await handle.read(context(), "user")).toMatchObject({
      data: { toast: { maxVisible: 3, position: "top", timeoutMs: 5000 } },
      renamedKeys: ["maxToastsVisible", "toast.timeout"],
    });
  });

  it("keeps the new key and drops the old one when both are present", async () => {
    await dirs.writeJson(userPath, { isSyncActive: false, syncEnabled: true });

    expect(await handle.read(context(), "user")).toMatchObject({
      data: { syncEnabled: true },
      renamedKeys: ["isSyncActive"],
    });
  });

  it("leaves an old key whose new path runs through a non-object", async () => {
    await dirs.writeJson(userPath, { maxToastsVisible: 3, toast: 5 });

    expect(await handle.read(context(), "user")).toMatchObject({
      data: { maxToastsVisible: 3, toast: 5 },
      renamedKeys: [],
    });
  });
});

describe("update", () => {
  function update(scope: "project" | "user", trusted = true): Promise<void> {
    return handle.update(context(trusted), scope, (data) => ({
      ...data,
      themes: { dark: "night" },
    }));
  }

  it("creates a missing file with the version first", async () => {
    await update("user");

    expect(await readFile(userPath, "utf8")).toBe(
      '{\n  "version": 2,\n  "themes": {\n    "dark": "night"\n  }\n}\n',
    );
  });

  it("keeps other keys and saves renamed keys under their new names", async () => {
    await dirs.writeJson(userPath, { isSyncActive: false, other: "kept" });

    await update("user");

    expect(await dirs.readJson(userPath)).toEqual({
      other: "kept",
      syncEnabled: false,
      themes: { dark: "night" },
      version: 2,
    });
  });

  it("refuses to overwrite a malformed file", async () => {
    await dirs.writeText(userPath, "{ nope");

    await expect(update("user")).rejects.toThrow(
      /is invalid \(not valid JSON: .*\)\. Fix the file and try again\.$/u,
    );
    expect(await readFile(userPath, "utf8")).toBe("{ nope");
  });

  it("refuses to overwrite a file from a newer version", async () => {
    await dirs.writeJson(userPath, { version: 3 });

    await expect(update("user")).rejects.toThrow(
      `${userPath} is invalid (unsupported version 3). Fix the file and try again.`,
    );
    expect(await dirs.readJson(userPath)).toEqual({ version: 3 });
  });

  it("refuses to save to an untrusted project", async () => {
    await expect(update("project", false)).rejects.toThrow(
      `The project is not trusted, so ${projectPath} was not saved. Trust the project and try again.`,
    );
    expect(await dirs.exists(projectPath)).toBe(false);
  });

  it("saves to the User file in an untrusted project", async () => {
    await update("user", false);

    expect(await dirs.readJson(userPath)).toEqual({
      themes: { dark: "night" },
      version: 2,
    });
  });

  it("leaves the file unchanged and no temporary file when the write fails", async () => {
    await dirs.writeJson(userPath, { other: "kept" });

    await expect(
      failingWriteHandle().update(context(), "user", () => ({})),
    ).rejects.toThrow("EROFS: read-only file system");
    expect(await dirs.readJson(userPath)).toEqual({ other: "kept" });
    expect(await temporaryFiles(userPath)).toEqual([]);
  });
});

describe("write", () => {
  it("replaces the file with renamed keys moved and the version first", async () => {
    await dirs.writeJson(userPath, { stale: true });

    await handle.write(context(), "user", { isSyncActive: false, version: 1 });

    expect(await readFile(userPath, "utf8")).toBe(
      '{\n  "version": 2,\n  "syncEnabled": false\n}\n',
    );
  });

  it("refuses to write to an untrusted project", async () => {
    await expect(handle.write(context(false), "project", {})).rejects.toThrow(
      `The project is not trusted, so ${projectPath} was not saved. Trust the project and try again.`,
    );
    expect(await dirs.exists(projectPath)).toBe(false);
  });
});

describe("migrateKeys", () => {
  it("rewrites a file with old keys under the new names and version", async () => {
    await dirs.writeJson(userPath, {
      maxToastsVisible: 3,
      toast: { position: "top", timeout: 5000 },
    });

    expect(await handle.migrateKeys(context())).toEqual({
      migrated: [userPath],
      warnings: [],
    });

    expect(await dirs.readJson(userPath)).toEqual({
      toast: { maxVisible: 3, position: "top", timeoutMs: 5000 },
      version: 2,
    });
  });

  it("rewrites User before Project", async () => {
    await dirs.writeJson(projectPath, { isSyncActive: true });
    await dirs.writeJson(userPath, { isSyncActive: false });

    expect((await handle.migrateKeys(context())).migrated).toEqual([
      userPath,
      projectPath,
    ]);
  });

  it("leaves current, missing, and invalid files alone", async () => {
    await dirs.writeJson(userPath, { toast: { timeoutMs: 1 } });
    await dirs.writeText(projectPath, "{ nope");

    expect(await handle.migrateKeys(context())).toEqual({
      migrated: [],
      warnings: [],
    });
    expect(await dirs.readJson(userPath)).toEqual({ toast: { timeoutMs: 1 } });
    expect(await readFile(projectPath, "utf8")).toBe("{ nope");
  });

  it("leaves a project file alone in an untrusted project", async () => {
    await dirs.writeJson(projectPath, { isSyncActive: false });

    expect(await handle.migrateKeys(context(false))).toEqual({
      migrated: [],
      warnings: [],
    });
    expect(await dirs.readJson(projectPath)).toEqual({ isSyncActive: false });
  });

  it("warns and leaves the file unchanged when the write fails", async () => {
    await dirs.writeJson(userPath, { maxToastsVisible: 3 });

    expect(await failingWriteHandle().migrateKeys(context())).toEqual({
      migrated: [],
      warnings: [
        `Could not migrate configuration at ${userPath}: EROFS: read-only file system. Left the file unchanged.`,
      ],
    });
    expect(await dirs.readJson(userPath)).toEqual({ maxToastsVisible: 3 });
  });
});
