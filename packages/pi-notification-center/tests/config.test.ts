import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import {
  CONFIG_LIMITS,
  CONFIG_VERSION,
  DEFAULT_CONFIG,
  loadConfig,
  loadStartupConfig,
  type ConfigPath,
} from "../src/config.js";
import {
  configFileWarnings,
  type AtomicWriteFs,
} from "@sherif-fanous/pi-extensions-core";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dirs: TempConfigDirs;
let userPath: string;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  userPath = join(dirs.agentDir, "notification-center", "config.json");
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("configuration constants", () => {
  it("documents the specified defaults", () => {
    expect(DEFAULT_CONFIG).toEqual({
      toast: { maxLines: 5, maxVisible: 5, timeoutMs: 3000, width: 64 },
    });
  });

  it("documents the specified limits", () => {
    expect(CONFIG_LIMITS).toEqual({
      "toast.maxLines": { max: 20, min: 1 },
      "toast.maxVisible": { max: 10, min: 1 },
      "toast.timeoutMs": { max: 60_000, min: 250 },
      "toast.width": { max: 80, min: 20 },
    });
  });

  it("keeps every default inside its own limits", () => {
    for (const [path, limits] of limitEntries()) {
      const value = DEFAULT_CONFIG.toast[settingKey(path)];

      expect(value).toBeGreaterThanOrEqual(limits.min);
      expect(value).toBeLessThanOrEqual(limits.max);
    }
  });
});

describe("loadConfig", () => {
  it("uses every default and stays silent when the file is absent", async () => {
    const result = await load();

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toEqual([]);
    expect(result.file).toEqual({
      path: userPath,
      scope: "user",
      state: "missing",
    });
  });

  it("applies valid values for every supported setting", async () => {
    await dirs.writeJson(userPath, {
      toast: { maxLines: 2, maxVisible: 2, timeoutMs: 250, width: 80 },
      version: CONFIG_VERSION,
    });

    const result = await load();

    expect(result.config).toEqual({
      toast: { maxLines: 2, maxVisible: 2, timeoutMs: 250, width: 80 },
    });
    expect(result.warnings).toEqual([]);
    expect(result.file.state).toBe("loaded");
  });

  it("reads a file without a version as the current version, silently", async () => {
    await dirs.writeJson(userPath, { toast: { maxVisible: 3 } });

    const result = await load();

    expect(result.config.toast.maxVisible).toBe(3);
    expect(result.warnings).toEqual([]);
    expect(configFileWarnings([result.file])).toEqual([]);
  });

  it("ignores a file with an unsupported version and warns once", async () => {
    await dirs.writeJson(userPath, { toast: { maxVisible: 3 }, version: 3 });

    const result = await load();

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toEqual([]);
    expect(result.file).toMatchObject({
      reason: "unsupported version 3",
      state: "invalid",
    });

    expect(configFileWarnings([result.file])).toEqual([
      `Configuration at ${userPath} has version 3, but only version 2 is supported. Ignored the file.`,
    ]);
  });

  it("reads and validates every documented setting", async () => {
    // Guards the loader against a setting that gains documented limits
    // but is never read, which would ignore the user's value in silence.
    for (const [path, limits] of limitEntries()) {
      const key = settingKey(path);

      await dirs.writeJson(userPath, { toast: { [key]: limits.min - 1 } });

      const result = await load();

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain(`"${path}"`);
      expect(result.warnings[0]).toContain(
        `default value ${String(DEFAULT_CONFIG.toast[key])}`,
      );
    }
  });

  it("ignores unknown keys without complaining", async () => {
    await dirs.writeJson(userPath, {
      position: "bottom-left",
      toast: { style: "rounded", width: 30 },
    });

    const result = await load();

    expect(result.config).toEqual({
      toast: { ...DEFAULT_CONFIG.toast, width: 30 },
    });
    expect(result.warnings).toEqual([]);
  });

  it("keeps valid settings and defaults each invalid one", async () => {
    await dirs.writeJson(userPath, {
      toast: { maxVisible: 99, timeoutMs: 5000, width: "wide" },
    });

    const result = await load();

    expect(result.config).toEqual({
      toast: { ...DEFAULT_CONFIG.toast, timeoutMs: 5000 },
    });

    expect(result.warnings).toEqual([
      'Setting "toast.maxVisible" must be an integer from 1 through 10, not 99. Using the default value 5.',
      'Setting "toast.width" must be an integer from 20 through 80, not "wide". Using the default value 64.',
    ]);
  });

  it("rejects non-integer and out-of-range numbers", async () => {
    await dirs.writeJson(userPath, {
      // A fraction inside the 250 through 60000 range, so only the
      // integer check can reject it.
      toast: { maxVisible: 0, timeoutMs: 300.5, width: 19 },
    });

    const result = await load();

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toHaveLength(3);
  });

  it("reports a non-object toast section once and keeps toast defaults", async () => {
    await dirs.writeJson(userPath, { toast: "wide" });

    const result = await load();

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toEqual([
      'Setting "toast" must be a JSON object, not "wide". Using default toast settings.',
    ]);
  });

  it("keeps a malformed file's problem on the file and uses all defaults", async () => {
    await dirs.writeText(userPath, "{ not json");

    const result = await load();

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toEqual([]);
    expect(result.file.state).toBe("invalid");
    expect(configFileWarnings([result.file])).toEqual([
      expect.stringMatching(
        /^Configuration at .+config\.json is not valid JSON: .+[^.]\. Ignored the file\.$/u,
      ),
    ]);
  });

  it("keeps a non-object document's problem on the file", async () => {
    await dirs.writeJson(userPath, [1, 2, 3]);

    const result = await load();

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(configFileWarnings([result.file])).toEqual([
      `Configuration at ${userPath} must be a JSON object. Ignored the file.`,
    ]);
  });

  it("reports an unreadable file rather than treating it as absent", async () => {
    const result = await loadConfig(createProjectTrustContext(dirs.cwd, true), {
      agentDir: dirs.agentDir,
      fs: {
        access: () => Promise.resolve(),
        readFile: () =>
          Promise.reject(
            Object.assign(new Error("denied"), { code: "EACCES" }),
          ),
      },
    });

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(configFileWarnings([result.file])).toEqual([
      `Could not read configuration at ${userPath}: denied. Ignored the file.`,
    ]);
  });

  it("reads the old key names while the new names are absent", async () => {
    await dirs.writeJson(userPath, {
      maxToastsVisible: 2,
      toast: { maxLines: 3, timeout: 1000 },
    });

    const result = await load();

    expect(result.config).toEqual({
      toast: {
        ...DEFAULT_CONFIG.toast,
        maxLines: 3,
        maxVisible: 2,
        timeoutMs: 1000,
      },
    });
    expect(result.warnings).toEqual([]);
    expect(result.file).toMatchObject({
      renamedKeys: ["maxToastsVisible", "toast.timeout"],
      state: "loaded",
    });
  });

  it("prefers a new key name over its old one", async () => {
    await dirs.writeJson(userPath, {
      maxToastsVisible: 2,
      toast: { maxVisible: 4, timeout: 1000, timeoutMs: 2000 },
    });

    const result = await load();

    expect(result.config.toast).toMatchObject({
      maxVisible: 4,
      timeoutMs: 2000,
    });
  });

  it("never reads a project file or asks whether the project is trusted", async () => {
    const isProjectTrusted = vi.fn(() => true);

    await dirs.writeJson(
      join(dirs.cwd, ".pi", "notification-center", "config.json"),
      { toast: { maxVisible: 2 } },
    );

    const result = await loadConfig(
      { cwd: dirs.cwd, isProjectTrusted },
      { agentDir: dirs.agentDir },
    );

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.file.path).toBe(userPath);
    expect(isProjectTrusted).not.toHaveBeenCalled();
  });
});

describe("loadStartupConfig", () => {
  it("rewrites old key names under the new names with the current version", async () => {
    await dirs.writeJson(userPath, {
      maxToastsVisible: 2,
      theme: "kept",
      toast: { timeout: 1000, width: 40 },
    });

    const result = await startup();

    expect(result.migrated).toEqual([userPath]);
    expect(result.migrationWarnings).toEqual([]);
    expect(result.config.toast).toMatchObject({
      maxVisible: 2,
      timeoutMs: 1000,
      width: 40,
    });

    expect(await readFile(userPath, "utf8")).toBe(
      `${JSON.stringify(
        {
          version: 2,
          theme: "kept",
          toast: { width: 40, maxVisible: 2, timeoutMs: 1000 },
        },
        null,
        2,
      )}\n`,
    );
  });

  it("leaves a file that already uses the new names alone", async () => {
    await dirs.writeJson(userPath, { toast: { maxVisible: 2 } });

    const before = await readFile(userPath, "utf8");
    const result = await startup();

    expect(result.migrated).toEqual([]);
    expect(await readFile(userPath, "utf8")).toBe(before);
  });

  it("creates no file when there is none", async () => {
    const result = await startup();

    expect(result.migrated).toEqual([]);
    expect(await dirs.exists(userPath)).toBe(false);
  });

  it("never rewrites a file with an unsupported version", async () => {
    await dirs.writeJson(userPath, { maxToastsVisible: 2, version: 3 });

    const before = await readFile(userPath, "utf8");
    const result = await startup();

    expect(result.migrated).toEqual([]);
    expect(await readFile(userPath, "utf8")).toBe(before);
  });

  it("warns and keeps the old values for the session when the rewrite fails", async () => {
    await dirs.writeJson(userPath, { maxToastsVisible: 2 });

    const before = await readFile(userPath, "utf8");
    const failingFs: AtomicWriteFs = {
      mkdir,
      open,
      rename: () => Promise.reject(new Error("disk full")),
      unlink,
    };
    const result = await loadStartupConfig(
      createProjectTrustContext(dirs.cwd, true),
      { agentDir: dirs.agentDir, atomicWriteFs: failingFs },
    );

    expect(result.migrated).toEqual([]);
    expect(result.migrationWarnings).toEqual([
      `Could not migrate configuration at ${userPath}: disk full. Left the file unchanged.`,
    ]);
    expect(result.config.toast.maxVisible).toBe(2);
    expect(await readFile(userPath, "utf8")).toBe(before);
  });
});

function limitEntries(): [ConfigPath, { max: number; min: number }][] {
  return Object.entries(CONFIG_LIMITS) as [
    ConfigPath,
    { max: number; min: number },
  ][];
}

function load(): ReturnType<typeof loadConfig> {
  return loadConfig(createProjectTrustContext(dirs.cwd, true), {
    agentDir: dirs.agentDir,
  });
}

function settingKey(path: ConfigPath): keyof typeof DEFAULT_CONFIG.toast {
  return path.slice("toast.".length) as keyof typeof DEFAULT_CONFIG.toast;
}

function startup(): ReturnType<typeof loadStartupConfig> {
  return loadStartupConfig(createProjectTrustContext(dirs.cwd, true), {
    agentDir: dirs.agentDir,
  });
}
