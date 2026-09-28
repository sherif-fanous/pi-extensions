/**
 * Covers structural legacy migration, atomic commit ordering, cleanup outcomes,
 * retries, and version 2 precedence for user and project scopes.
 */
import { chmod, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  migrateAll,
  migrateScope,
  type MigrationFs,
} from "../../src/store/migrate.js";
import type { PresetScope } from "../../src/types.js";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dirs: TempConfigDirs;

const preset = {
  name: "plan",
  provider: "anthropic",
  model: "claude-opus",
  extra: { retained: true },
};
const rule = {
  match: "^/work/",
  allow: [{ pattern: "^plan$", custom: true }],
};

beforeEach(async () => {
  dirs = await createTempConfigDirs();
});

afterEach(async () => {
  await dirs.cleanup();
});

function configPath(scope: PresetScope): string {
  return join(scopeDir(scope), "config.json");
}

function context(trusted = true) {
  return createProjectTrustContext(dirs.cwd, trusted);
}

function projectPresetsPath(): string {
  return join(scopeDir("project"), "presets.json");
}

async function put(path: string, value: unknown): Promise<void> {
  await dirs.writeText(
    path,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

async function readDocument(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

function scopeDir(scope: PresetScope): string {
  return scope === "user"
    ? join(dirs.agentDir, "presets-plus")
    : join(dirs.cwd, ".pi", "presets-plus");
}

function userPolicyPath(): string {
  return join(scopeDir("user"), "policy.json");
}

function userPresetsPath(): string {
  return join(scopeDir("user"), "presets.json");
}

describe("migrateScope", () => {
  it.each([
    [
      "config",
      () =>
        put(configPath("user"), {
          version: 1,
          showInactiveStatus: false,
        }),
    ],
    [
      "presets",
      () => put(userPresetsPath(), { version: 1, presets: [preset] }),
    ],
    ["policy", () => put(userPolicyPath(), { version: 1, rules: [rule] })],
  ])("migrates a user %s file alone", async (_name, create) => {
    await create();

    const result = await migrateScope("user", context());

    expect(result).toEqual({ migrated: [configPath("user")], warnings: [] });

    const document = await readDocument(configPath("user"));

    expect(document.version).toBe(2);
  });

  it("combines all user files and removes sidecars after commit", async () => {
    await put(configPath("user"), {
      version: 1,
      showInactiveStatus: false,
    });

    await put(userPresetsPath(), {
      version: 1,
      presets: [preset],
    });
    await put(userPolicyPath(), { version: 1, rules: [rule] });

    const result = await migrateScope("user", context());
    const document = await readDocument(configPath("user"));

    expect(result.migrated).toHaveLength(1);
    expect(document).toEqual({
      version: 2,
      showInactiveStatus: false,
      presets: [preset],
      policy: { rules: [rule] },
    });

    await expect(readFile(userPresetsPath())).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(readFile(userPolicyPath())).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("migrates project presets and removes the project sidecar", async () => {
    await put(projectPresetsPath(), { version: 1, presets: [preset] });

    const result = await migrateScope("project", context());

    expect(result.migrated).toHaveLength(1);
    expect(await readDocument(configPath("project"))).toEqual({
      version: 2,
      presets: [preset],
    });

    await expect(readFile(projectPresetsPath())).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("copies invalid individual entries unchanged for normal validation", async () => {
    const invalid = { name: "broken", provider: "anthropic" };

    await put(userPresetsPath(), {
      version: 1,
      presets: [preset, invalid],
    });
    await put(userPolicyPath(), { version: 1, rules: [rule] });

    await migrateScope("user", context());

    const document = await readDocument(configPath("user"));

    expect(document.presets).toEqual([preset, invalid]);
    expect(document.policy).toEqual({ rules: [rule] });
  });

  it("leaves a scope unchanged when a legacy file is invalid", async () => {
    const original = "not json";

    await put(userPresetsPath(), original);
    await put(userPolicyPath(), { version: 1, rules: [rule] });

    const result = await migrateScope("user", context());

    expect(result.migrated).toEqual([]);
    expect(result.warnings[0]).toContain(userPresetsPath());
    expect(await readFile(userPresetsPath(), "utf8")).toBe(original);

    await expect(readFile(configPath("user"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    expect(await readDocument(userPolicyPath())).toEqual({
      version: 1,
      rules: [rule],
    });
  });

  // A read-only directory fails the write; root ignores the permission.
  it.skipIf(process.getuid?.() === 0)(
    "does not delete sidecars when the destination cannot be written",
    async () => {
      await put(userPresetsPath(), {
        version: 1,
        presets: [preset],
      });

      const directory = dirname(configPath("user"));

      await chmod(directory, 0o500);

      let result: Awaited<ReturnType<typeof migrateScope>>;

      try {
        result = await migrateScope("user", context());
      } finally {
        await chmod(directory, 0o700);
      }

      expect(result.migrated).toEqual([]);
      expect(result.warnings.join(" ")).toContain("could not write");
      expect(await readDocument(userPresetsPath())).toEqual({
        version: 1,
        presets: [preset],
      });
    },
  );

  it("treats missing cleanup files as success and warns on other cleanup failures", async () => {
    await put(userPresetsPath(), {
      version: 1,
      presets: [preset],
    });

    const missing = userPolicyPath();
    const success = await migrateScope("user", context());

    expect(success.warnings).toEqual([]);

    await rm(configPath("user"));
    await put(userPresetsPath(), {
      version: 1,
      presets: [preset],
    });
    await put(missing, { version: 1, rules: [] });

    const cleanupFs: MigrationFs = {
      readFile,
      unlink: async (path) => {
        if (String(path) === missing) throw new Error("permission denied");
        await rm(String(path), { force: true });
      },
    };
    const failedCleanup = await migrateScope("user", context(), cleanupFs);

    expect(failedCleanup.migrated).toEqual([configPath("user")]);
    expect(failedCleanup.warnings.join(" ")).toContain(missing);
  });

  it("makes a second migration attempt a no-op and ignores sidecars beside v2", async () => {
    await put(configPath("user"), {
      version: 2,
      presets: [preset],
    });

    await put(userPresetsPath(), {
      version: 1,
      presets: [{ ...preset, name: "stale" }],
    });

    const first = await migrateScope("user", context());
    const second = await migrateScope("user", context());

    expect(first).toEqual({ migrated: [], warnings: [] });
    expect(second).toEqual(first);
    expect(await readDocument(userPresetsPath())).toEqual({
      version: 1,
      presets: [{ ...preset, name: "stale" }],
    });
  });

  it("retries after a failed scope without changing the other scope", async () => {
    await put(userPresetsPath(), "{");

    const first = await migrateAll(context());

    expect(first.migrated).toEqual([]);

    await put(userPresetsPath(), {
      version: 1,
      presets: [preset],
    });

    const second = await migrateAll(context());

    expect(second.migrated).toEqual([configPath("user")]);
  });

  it("never overwrites a user config.json without version", async () => {
    const current = { presets: [preset] };

    await put(configPath("user"), current);
    await put(userPresetsPath(), { version: 1, presets: [] });

    const result = await migrateScope("user", context());

    expect(result).toEqual({ migrated: [], warnings: [] });
    expect(await readDocument(configPath("user"))).toEqual(current);

    expect(await readDocument(userPresetsPath())).toEqual({
      version: 1,
      presets: [],
    });
  });
});

describe("migrateAll", () => {
  it("does not migrate an untrusted project", async () => {
    const legacy = { version: 1, presets: [preset] };

    await put(projectPresetsPath(), legacy);

    const outcome = await migrateAll(context(false));

    expect(outcome).toEqual({ migrated: [], warnings: [] });
    expect(await readDocument(projectPresetsPath())).toEqual(legacy);
    await expect(readFile(configPath("project"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
