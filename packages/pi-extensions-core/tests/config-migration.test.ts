import * as fsPromises from "node:fs/promises";

import {
  configFilePath,
  configMigratedMessage,
  loadConfigFiles,
  migrateRenamedConfigKeys,
  type AtomicWriteFs,
} from "../src/index.js";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION = "notification-center";
const RENAMES = [
  { from: "maxToastsVisible", to: "toast.maxVisible" },
  { from: "toast.timeout", to: "toast.timeoutMs" },
] as const;

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

async function loadBoth(): Promise<
  Awaited<ReturnType<typeof loadConfigFiles<"project" | "user">>>
> {
  return loadConfigFiles(createProjectTrustContext(dirs.cwd, true), {
    agentDir: dirs.agentDir,
    extension: EXTENSION,
    renamedKeys: RENAMES,
    scopes: ["user", "project"],
    version: 2,
  });
}

describe("migrateRenamedConfigKeys", () => {
  it("rewrites a file with old keys under the new names and version", async () => {
    await dirs.writeJson(userPath, {
      maxToastsVisible: 3,
      toast: { position: "top", timeout: 5000 },
    });

    const files = await loadBoth();
    const result = await migrateRenamedConfigKeys(Object.values(files), 2);

    expect(result).toEqual({ migrated: [userPath], warnings: [] });
    expect(await dirs.readJson(userPath)).toEqual({
      toast: { maxVisible: 3, position: "top", timeoutMs: 5000 },
      version: 2,
    });
  });

  it("leaves current, missing, and invalid files alone", async () => {
    await dirs.writeJson(userPath, { toast: { timeoutMs: 1 } });
    await dirs.writeText(projectPath, "{ nope");

    const files = await loadBoth();
    const result = await migrateRenamedConfigKeys(Object.values(files), 2);

    expect(result).toEqual({ migrated: [], warnings: [] });
    expect(await dirs.readJson(userPath)).toEqual({ toast: { timeoutMs: 1 } });
  });

  it("warns and leaves the file unchanged when the write fails", async () => {
    await dirs.writeJson(userPath, { maxToastsVisible: 3 });

    const files = await loadBoth();
    const failingFs: AtomicWriteFs = {
      mkdir: fsPromises.mkdir,
      open: fsPromises.open,
      rename: vi
        .fn<typeof fsPromises.rename>()
        .mockRejectedValue(new Error("EROFS: read-only file system")),
      unlink: fsPromises.unlink,
    };
    const result = await migrateRenamedConfigKeys(
      Object.values(files),
      2,
      failingFs,
    );

    expect(result).toEqual({
      migrated: [],
      warnings: [
        `Could not migrate configuration at ${userPath}: EROFS: read-only file system. Left the file unchanged.`,
      ],
    });
    expect(await dirs.readJson(userPath)).toEqual({ maxToastsVisible: 3 });
  });
});

describe("configMigratedMessage", () => {
  it("names one migrated file", () => {
    expect(configMigratedMessage("Theme Sync", ["/a/config.json"])).toBe(
      "Theme Sync migrated its configuration to /a/config.json.",
    );
  });

  it("joins two files with and", () => {
    expect(
      configMigratedMessage("Presets Plus", [
        "/a/config.json",
        "/b/config.json",
      ]),
    ).toBe(
      "Presets Plus migrated its configuration to /a/config.json and /b/config.json.",
    );
  });

  it("lists three files with a serial comma", () => {
    expect(configMigratedMessage("X", ["/a", "/b", "/c"])).toBe(
      "X migrated its configuration to /a, /b, and /c.",
    );
  });
});
