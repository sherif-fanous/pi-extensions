import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  configFilePath,
  configFileWarnings,
  configScopeLabel,
  loadConfigFiles,
  readConfigFile,
  updateConfigFile,
  writeConfigFile,
  type ConfigFile,
} from "../src/index.js";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const EXTENSION = "theme-sync";
const RENAMES = [{ from: "isSyncActive", to: "syncEnabled" }] as const;

let dirs: TempConfigDirs;
let userPath: string;
let projectPath: string;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  userPath = configFilePath("user", {
    agentDir: dirs.agentDir,
    cwd: dirs.cwd,
    extension: EXTENSION,
  });

  projectPath = configFilePath("project", {
    cwd: dirs.cwd,
    extension: EXTENSION,
  });
});

afterEach(async () => {
  await dirs.cleanup();
});

function load(
  trusted: boolean,
): Promise<Record<"project" | "user", ConfigFile>> {
  return loadConfigFiles(createProjectTrustContext(dirs.cwd, trusted), {
    agentDir: dirs.agentDir,
    extension: EXTENSION,
    renamedKeys: RENAMES,
    scopes: ["user", "project"],
    version: 2,
  });
}

describe("configFilePath", () => {
  it("puts config.json in the extension's folder of each scope", () => {
    expect(userPath).toBe(join(dirs.agentDir, EXTENSION, "config.json"));
    expect(projectPath).toBe(join(dirs.cwd, ".pi", EXTENSION, "config.json"));
  });
});

describe("configScopeLabel", () => {
  it("names the scopes as Pi does", () => {
    expect(configScopeLabel("user")).toBe("User");
    expect(configScopeLabel("project")).toBe("Project");
  });
});

describe("loadConfigFiles", () => {
  it("loads both scopes when the project is trusted", async () => {
    await dirs.writeJson(userPath, { version: 2, themes: { dark: "a" } });
    await dirs.writeJson(projectPath, { themes: { dark: "b" } });

    const files = await load(true);

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

    const files = await load(false);

    expect(files.user.state).toBe("loaded");
    expect(files.project).toEqual({
      path: projectPath,
      scope: "project",
      state: "untrusted",
      warning: `Skipped project configuration at ${projectPath} because the project is not trusted. Trust the project to use it.`,
    });
  });

  it("stays silent about an untrusted project without a file", async () => {
    const files = await load(false);

    expect(files.project).toEqual({
      path: projectPath,
      scope: "project",
      state: "missing",
    });
    expect(configFileWarnings(Object.values(files))).toEqual([]);
  });

  it("reads only the user scope without asking about trust", async () => {
    const ctx = {
      cwd: dirs.cwd,
      isProjectTrusted: (): boolean => {
        throw new Error("trust was checked");
      },
    };

    const files = await loadConfigFiles(ctx, {
      agentDir: dirs.agentDir,
      extension: "notification-center",
      scopes: ["user"],
      version: 2,
    });

    expect(Object.keys(files)).toEqual(["user"]);
    expect(files.user.state).toBe("missing");
  });
});

describe("readConfigFile", () => {
  function read(path = userPath, version = 2): Promise<ConfigFile> {
    return readConfigFile({
      path,
      renamedKeys: RENAMES,
      scope: "user",
      trusted: true,
      version,
    });
  }

  it("reports a missing file without a warning", async () => {
    expect(await read()).toEqual({
      path: userPath,
      scope: "user",
      state: "missing",
    });
  });

  it("treats a file without a version as the current version", async () => {
    await dirs.writeJson(userPath, { syncEnabled: true });

    expect(await read()).toMatchObject({
      data: { syncEnabled: true },
      state: "loaded",
    });
  });

  it("ignores a file with a newer version", async () => {
    await dirs.writeJson(userPath, { syncEnabled: true, version: 3 });

    expect(await read()).toEqual({
      path: userPath,
      reason: "unsupported version 3",
      scope: "user",
      state: "invalid",
      warning: `Configuration at ${userPath} has version 3, but only version 2 is supported. Ignored the file.`,
    });
  });

  it("ignores a file whose version is not a number", async () => {
    await dirs.writeJson(userPath, { version: "2" });

    expect(await read()).toMatchObject({
      reason: 'unsupported version "2"',
      state: "invalid",
    });
  });

  it("reports invalid JSON with the parse error", async () => {
    await dirs.writeText(userPath, "{ nope");

    const file = await read();

    expect(file.state).toBe("invalid");
    expect(file).toMatchObject({
      reason: expect.stringMatching(/^not valid JSON: \S/u) as unknown,
      warning: expect.stringMatching(
        /^Configuration at .* is not valid JSON: .* Ignored the file\.$/u,
      ) as unknown,
    });
  });

  it("reports a JSON value that is not an object", async () => {
    await dirs.writeJson(userPath, [1, 2]);

    expect(await read()).toEqual({
      path: userPath,
      reason: "not a JSON object",
      scope: "user",
      state: "invalid",
      warning: `Configuration at ${userPath} must be a JSON object. Ignored the file.`,
    });
  });

  it("reports a file it could not read", async () => {
    const file = await readConfigFile({
      fs: {
        access: () => Promise.resolve(),
        readFile: () =>
          Promise.reject(
            Object.assign(new Error("EACCES: permission denied."), {
              code: "EACCES",
            }),
          ),
      },
      path: userPath,
      scope: "user",
      trusted: true,
      version: 2,
    });

    expect(file).toEqual({
      path: userPath,
      reason: "unreadable: EACCES: permission denied",
      scope: "user",
      state: "invalid",
      warning: `Could not read configuration at ${userPath}: EACCES: permission denied. Ignored the file.`,
    });
  });

  it("reads a renamed key under its new name and lists the old one", async () => {
    await dirs.writeJson(userPath, { isSyncActive: false });

    expect(await read()).toMatchObject({
      data: { syncEnabled: false },
      renamedKeys: ["isSyncActive"],
      state: "loaded",
    });
  });
});

describe("configFileWarnings", () => {
  it("collects the warnings of invalid and untrusted files in order", async () => {
    await dirs.writeJson(userPath, { version: 9 });
    await dirs.writeJson(projectPath, {});

    const files = await load(false);

    expect(configFileWarnings([files.user, files.project])).toEqual([
      `Configuration at ${userPath} has version 9, but only version 2 is supported. Ignored the file.`,
      `Skipped project configuration at ${projectPath} because the project is not trusted. Trust the project to use it.`,
    ]);
  });
});

describe("writeConfigFile", () => {
  it("writes the version as the first key, replacing the document's", async () => {
    await writeConfigFile(userPath, { other: 1, version: 1 }, 2);

    expect(await readFile(userPath, "utf8")).toBe(
      '{\n  "version": 2,\n  "other": 1\n}\n',
    );
  });
});

describe("updateConfigFile", () => {
  function update(scope: "project" | "user", trusted: boolean): Promise<void> {
    return updateConfigFile(
      {
        path: scope === "user" ? userPath : projectPath,
        renamedKeys: RENAMES,
        scope,
        trusted,
        version: 2,
      },
      (data) => ({ ...data, themes: { dark: "night" } }),
    );
  }

  it("creates a missing file with the current version", async () => {
    await update("user", true);

    expect(await dirs.readJson(userPath)).toEqual({
      themes: { dark: "night" },
      version: 2,
    });
  });

  it("keeps other keys and saves renamed keys under their new names", async () => {
    await dirs.writeJson(userPath, { isSyncActive: false, other: "kept" });

    await update("user", true);

    expect(await dirs.readJson(userPath)).toEqual({
      other: "kept",
      syncEnabled: false,
      themes: { dark: "night" },
      version: 2,
    });
  });

  it("refuses to overwrite a malformed file", async () => {
    await dirs.writeText(userPath, "{ nope");

    await expect(update("user", true)).rejects.toThrow(
      /is invalid \(not valid JSON: .*\)\. Fix the file and try again\.$/u,
    );
    expect(await readFile(userPath, "utf8")).toBe("{ nope");
  });

  it("refuses to overwrite a file from a newer version", async () => {
    await dirs.writeJson(userPath, { version: 3 });

    await expect(update("user", true)).rejects.toThrow(
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
});
