/**
 * Covers the storage API against a real filesystem: loading both scopes
 * together, saving one scope, and adding, updating, moving, removing, and
 * reordering presets, along with the refusals and warnings each returns.
 * Every test points `PI_CODING_AGENT_DIR` and `ctx.cwd` at fresh temporary
 * directories so both scopes live under them.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  addPreset,
  loadPresetsConfig,
  movePreset,
  removePreset,
  reorderWithinScope,
  saveScope,
  updatePreset,
} from "../../src/store/api.js";
import type { Preset, PresetScope } from "../../src/types.js";
import {
  makeStubModelRegistry,
  type RegistryStub,
} from "../helpers/model-registry.js";
import {
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fullRegistry: RegistryStub = {
  models: {
    anthropic: { "claude-opus-4.5": { hasKey: true, reasoning: true } },
    openai: { "gpt-5": { hasKey: true, reasoning: false } },
  },
};

let dirs: TempConfigDirs;
let agentDir: string;
let projectDir: string;

function makeCtx(cwd: string, stub: RegistryStub, trusted = true) {
  return {
    cwd,
    isProjectTrusted: () => trusted,
    modelRegistry: makeStubModelRegistry(stub),
  };
}

function preset(name: string, extra: Partial<Preset> = {}): Preset {
  return {
    name,
    provider: "anthropic",
    model: "claude-opus-4.5",
    ...extra,
  };
}

function presetPath(scope: PresetScope): string {
  return scope === "user"
    ? join(agentDir, "presets-plus", "config.json")
    : join(projectDir, ".pi", "presets-plus", "config.json");
}

function unsafeMutationReason(scope: PresetScope, path: string): string {
  return `Presets Plus did not change the ${scope} configuration file at ${path}. It could not load the complete file. Fix the file and try again.`;
}

async function writeRawScope(
  scope: PresetScope,
  contents: string,
): Promise<string> {
  const path = presetPath(scope);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf-8");

  return path;
}

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  agentDir = dirs.agentDir;
  projectDir = dirs.cwd;
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("loadPresetsConfig", () => {
  it("returns an empty list when neither file exists", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const result = await loadPresetsConfig(ctx);

    expect(result.presets).toEqual([]);
    expect(result.config.warnings).toEqual([]);
    expect(result.hotkeyAnalysis.conflicts).toEqual([]);
    expect(result.hotkeyAnalysis.invalid).toEqual([]);
    expect(result.policy).toEqual({ rules: [], warnings: [] });
  });

  it("merges both scopes and surfaces warnings from each", async () => {
    await mkdir(join(agentDir, "presets-plus"), { recursive: true });
    await writeFile(
      join(agentDir, "presets-plus", "config.json"),
      "not json",
      "utf-8",
    );

    const ctx = makeCtx(projectDir, fullRegistry);

    await writeRawScope(
      "project",
      JSON.stringify({
        version: 2,
        showInactiveStatus: "yes",
        presets: [preset("plan")],
      }),
    );

    const result = await loadPresetsConfig(ctx);

    expect(
      result.presets.map((loaded) => `${loaded.scope}:${loaded.name}`),
    ).toEqual(["project:plan"]);

    expect(result.config.warnings).toEqual([
      expect.stringMatching(
        /^Configuration at .+ is not valid JSON: .+[^.]\. Ignored the file\.$/u,
      ),
      'Project setting "showInactiveStatus" must be a boolean, not "yes". Using the default value true.',
    ]);
    expect(result.policy).toEqual({ rules: [], warnings: [] });
  });

  it("ignores an invalid project setting when the user setting applies", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await writeRawScope(
      "user",
      JSON.stringify({ version: 2, showInactiveStatus: false }),
    );

    await writeRawScope(
      "project",
      JSON.stringify({ version: 2, showInactiveStatus: "yes" }),
    );

    const result = await loadPresetsConfig(ctx);

    expect(result.showInactiveStatus).toBe(false);
    expect(result.config.warnings).toEqual([
      'Project setting "showInactiveStatus" must be a boolean, not "yes". Ignored it.',
    ]);
  });

  it("surfaces a project policy section as one warning", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await writeRawScope(
      "project",
      JSON.stringify({
        version: 2,
        policy: { rules: [] },
        presets: [preset("plan")],
      }),
    );

    const result = await loadPresetsConfig(ctx);

    expect(result.presets.map((loaded) => loaded.name)).toEqual(["plan"]);
    expect(result.config.warnings).toEqual([
      `The project config file ${presetPath("project")} contains policy, but policy is supported only in the user configuration.`,
    ]);
    expect(result.policy).toEqual({ rules: [], warnings: [] });
  });

  it("compiles the user policy and keeps its warnings out of the configuration's", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const path = await writeRawScope(
      "user",
      JSON.stringify({
        version: 2,
        policy: { rules: [{ match: "[" }, { match: "work" }] },
      }),
    );

    const result = await loadPresetsConfig(ctx);

    expect(result.policy.rules.map((rule) => rule.match)).toEqual(["work"]);
    expect(result.policy.warnings).toEqual([
      `Skipped policy rule 1 in ${path}: match pattern "[" is invalid.`,
    ]);
    expect(result.config.warnings).toEqual([]);
  });

  it("warns once about a malformed user policy section", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const path = await writeRawScope(
      "user",
      JSON.stringify({ version: 2, policy: { rules: "work" } }),
    );

    const result = await loadPresetsConfig(ctx);

    expect(result.policy).toEqual({
      rules: [],
      warnings: [
        `The config file ${path} has an invalid "policy" section; expected an object with a "rules" array.`,
      ],
    });
    expect(result.config.warnings).toEqual([]);
  });

  it("applies no policy from a user file with an unsupported version", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await writeRawScope(
      "user",
      JSON.stringify({ version: 3, policy: { rules: [{ match: "work" }] } }),
    );

    const result = await loadPresetsConfig(ctx);

    expect(result.policy).toEqual({ rules: [], warnings: [] });
    expect(result.config.warnings).toEqual([
      expect.stringContaining("has version 3, but only version 2 is supported"),
    ]);
  });

  it("sets clampWarning for loaded presets that will clamp thinking", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope(
      "user",
      [
        preset("reasoning", { thinkingLevel: "high" }),
        preset("clamped", {
          model: "gpt-5",
          provider: "openai",
          thinkingLevel: "high",
        }),
        preset("off", {
          model: "gpt-5",
          provider: "openai",
          thinkingLevel: "off",
        }),
      ],
      ctx,
    );

    const loaded = await loadPresetsConfig(ctx);

    expect(
      loaded.presets.find((entry) => entry.name === "reasoning")?.clampWarning,
    ).toBeUndefined();

    expect(
      loaded.presets.find((entry) => entry.name === "clamped")?.clampWarning,
    ).toBe(true);

    expect(
      loaded.presets.find((entry) => entry.name === "off")?.clampWarning,
    ).toBeUndefined();
  });

  it("observes external file edits between calls (no in-memory cache)", async () => {
    // `ctx.reload()` works only because every `loadPresetsConfig` re-reads the file,
    // so two calls on the same context can return different presets.
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a")], ctx);

    const first = await loadPresetsConfig(ctx);

    expect(first.presets.map((loaded) => loaded.name)).toEqual(["a"]);

    await mkdir(join(agentDir, "presets-plus"), { recursive: true });
    await writeFile(
      join(agentDir, "presets-plus", "config.json"),
      JSON.stringify({
        version: 2,
        presets: [preset("a"), preset("b")],
      }),
      "utf-8",
    );

    const second = await loadPresetsConfig(ctx);

    expect(second.presets.map((loaded) => loaded.name)).toEqual(["a", "b"]);
  });
});

describe("saveScope", () => {
  it("writes a versioned file containing exactly the supplied presets", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("plan"), preset("ship")], ctx);

    const path = join(agentDir, "presets-plus", "config.json");
    const parsed = JSON.parse(await readFile(path, "utf-8")) as {
      version: number;
      presets: Preset[];
    };

    expect(parsed.version).toBe(2);
    expect(parsed.presets.map((entry) => entry.name)).toEqual(["plan", "ship"]);
  });

  it("only touches the affected scope's file", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("project", [preset("p")], ctx);

    const result = await loadPresetsConfig(ctx);

    expect(
      result.presets.map((loaded) => `${loaded.scope}:${loaded.name}`),
    ).toEqual(["project:p"]);
  });

  it("strips merge-only metadata when round-tripping LoadedPresets", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);

    const loaded = (await loadPresetsConfig(ctx)).presets;

    await saveScope("user", loaded, ctx);

    const raw = await readFile(
      join(agentDir, "presets-plus", "config.json"),
      "utf-8",
    );

    expect(raw).not.toContain('"scope"');
    expect(raw).not.toContain('"shadowed"');
    expect(raw).not.toContain('"unavailable"');
  });
});

describe("addPreset", () => {
  it("preserves every other configuration section when adding", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const path = presetPath("user");

    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        version: 2,
        showInactiveStatus: false,
        policy: { rules: [{ match: "work" }] },
        unknown: { retained: true },
        presets: [preset("old")],
      }),
      "utf8",
    );

    expect(await addPreset(preset("new"), "user", ctx)).toEqual({ ok: true });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      version: 2,
      showInactiveStatus: false,
      policy: { rules: [{ match: "work" }] },
      unknown: { retained: true },
      presets: [preset("old"), preset("new")],
    });
    expect((await readFile(path, "utf8")).endsWith("\n")).toBe(true);
  });

  it("appends to an empty scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const result = await addPreset(preset("plan"), "user", ctx);

    expect(result).toEqual({ ok: true });

    const loaded = await loadPresetsConfig(ctx);

    expect(loaded.presets.map((entry) => entry.name)).toEqual(["plan"]);
  });

  it("returns Err on name collision within the same scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await addPreset(preset("plan"), "user", ctx);

    const result = await addPreset(preset("plan"), "user", ctx);

    expect(result.ok).toBe(false);

    if (result.ok === false) {
      expect(result.reason).toContain('"plan"');
    }
  });

  it("allows the same name in a different scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await addPreset(preset("plan"), "user", ctx);

    const result = await addPreset(preset("plan"), "project", ctx);

    expect(result).toEqual({ ok: true });
  });
});

describe("mutations in an untrusted project", () => {
  it("refuses to create a project file", async () => {
    const ctx = makeCtx(projectDir, fullRegistry, false);
    const path = presetPath("project");

    expect(await addPreset(preset("plan"), "project", ctx)).toEqual({
      ok: false,
      reason: `The project is not trusted, so ${path} was not saved. Trust the project and try again.`,
    });
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to move a preset out of a skipped project file", async () => {
    const project = JSON.stringify({ presets: [preset("move")], version: 2 });
    const path = await writeRawScope("project", project);
    const ctx = makeCtx(projectDir, fullRegistry, false);

    const result = await movePreset(
      "move",
      "project",
      "user",
      preset("move"),
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(await readFile(path, "utf-8")).toBe(project);
    await expect(stat(presetPath("user"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("still saves the user scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry, false);

    expect(await addPreset(preset("plan"), "user", ctx)).toEqual({ ok: true });
  });
});

describe("saving a file without version", () => {
  it("stamps version 2 first and keeps the other keys", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const path = await writeRawScope(
      "user",
      JSON.stringify({ showInactiveStatus: false, presets: [] }),
    );

    expect(await addPreset(preset("plan"), "user", ctx)).toEqual({ ok: true });
    expect(await readFile(path, "utf-8")).toBe(
      `${JSON.stringify(
        { version: 2, showInactiveStatus: false, presets: [preset("plan")] },
        null,
        2,
      )}\n`,
    );
  });
});

describe("updatePreset", () => {
  it("replaces a preset in place and preserves the complete document", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = {
      version: 2,
      showInactiveStatus: false,
      policy: { rules: [{ match: "work" }] },
      unknown: { retained: true },
      presets: [preset("a"), preset("b"), preset("c")],
    };
    const path = await writeRawScope("user", JSON.stringify(original));

    const result = await updatePreset(
      "b",
      "user",
      preset("b", { thinkingLevel: "high" }),
      ctx,
    );

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(await readFile(path, "utf-8"))).toEqual({
      ...original,
      presets: [
        preset("a"),
        preset("b", { thinkingLevel: "high" }),
        preset("c"),
      ],
    });
  });

  it("supports renaming when there is no collision", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("old")], ctx);

    const result = await updatePreset("old", "user", preset("new"), ctx);

    expect(result).toEqual({ ok: true });
    expect(
      (await loadPresetsConfig(ctx)).presets.map((entry) => entry.name),
    ).toEqual(["new"]);
  });

  it("returns Err when the target name is missing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const result = await updatePreset("nope", "user", preset("nope"), ctx);

    expect(result.ok).toBe(false);
  });

  it("returns Err when a rename would collide with another preset", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);

    const result = await updatePreset("a", "user", preset("b"), ctx);

    expect(result.ok).toBe(false);
  });
});

describe("movePreset", () => {
  it("moves a user preset to the project scope and preserves both documents", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const user = {
      version: 2,
      showInactiveStatus: false,
      policy: { rules: [] },
      unknown: "user",
      presets: [preset("keep"), preset("move")],
    };
    const project = {
      version: 2,
      showInactiveStatus: true,
      unknown: "project",
      presets: [preset("project")],
    };
    const userPath = await writeRawScope("user", JSON.stringify(user));
    const projectPath = await writeRawScope("project", JSON.stringify(project));

    const result = await movePreset(
      "move",
      "user",
      "project",
      preset("moved"),
      ctx,
    );

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(await readFile(userPath, "utf-8"))).toEqual({
      ...user,
      presets: [preset("keep")],
    });

    expect(JSON.parse(await readFile(projectPath, "utf-8"))).toEqual({
      ...project,
      presets: [preset("project"), preset("moved")],
    });
  });

  it("moves a project preset to the user scope and preserves both documents", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const user = {
      version: 2,
      showInactiveStatus: false,
      policy: { rules: [] },
      unknown: "user",
      presets: [preset("user")],
    };
    const project = {
      version: 2,
      showInactiveStatus: true,
      unknown: "project",
      presets: [preset("move"), preset("keep")],
    };
    const userPath = await writeRawScope("user", JSON.stringify(user));
    const projectPath = await writeRawScope("project", JSON.stringify(project));

    const result = await movePreset(
      "move",
      "project",
      "user",
      preset("moved"),
      ctx,
    );

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(await readFile(userPath, "utf-8"))).toEqual({
      ...user,
      presets: [preset("user"), preset("moved")],
    });

    expect(JSON.parse(await readFile(projectPath, "utf-8"))).toEqual({
      ...project,
      presets: [preset("keep")],
    });
  });

  it("rejects matching source and destination scopes without writing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const writeScope = vi.fn<typeof saveScope>();

    const result = await movePreset(
      "move",
      "user",
      "user",
      preset("move"),
      ctx,
      writeScope,
    );

    expect(result).toEqual({
      ok: false,
      reason: "Source and destination scopes must be different.",
    });
    expect(writeScope).not.toHaveBeenCalled();
  });

  it("rejects a missing source without writing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const writeScope = vi.fn<typeof saveScope>();

    await saveScope("user", [preset("keep")], ctx);

    const result = await movePreset(
      "missing",
      "user",
      "project",
      preset("missing"),
      ctx,
      writeScope,
    );

    expect(result.ok).toBe(false);
    expect(writeScope).not.toHaveBeenCalled();
  });

  it("rejects a destination collision without writing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const writeScope = vi.fn<typeof saveScope>();

    await saveScope("user", [preset("move")], ctx);
    await saveScope("project", [preset("taken")], ctx);

    const result = await movePreset(
      "move",
      "user",
      "project",
      preset("taken"),
      ctx,
      writeScope,
    );

    expect(result.ok).toBe(false);
    expect(writeScope).not.toHaveBeenCalled();
  });

  it("leaves both scopes unchanged when the destination write fails", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const writeError = new Error("destination write failed");
    const writeScope = vi.fn<typeof saveScope>().mockRejectedValue(writeError);

    await saveScope("user", [preset("move")], ctx);
    await saveScope("project", [preset("keep")], ctx);

    await expect(
      movePreset("move", "user", "project", preset("move"), ctx, writeScope),
    ).rejects.toBe(writeError);

    expect(
      (await loadPresetsConfig(ctx)).presets.map(
        (entry) => `${entry.scope}:${entry.name}`,
      ),
    ).toEqual(["user:move", "project:keep"]);
  });

  it("restores the destination when the source write fails", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const sourceError = new Error("source write failed");
    const writeScope = vi.fn<typeof saveScope>(
      async (scope, presets, context) => {
        if (writeScope.mock.calls.length === 2) throw sourceError;
        await saveScope(scope, presets, context);
      },
    );

    await saveScope("user", [preset("move")], ctx);
    await saveScope("project", [preset("keep")], ctx);

    await expect(
      movePreset("move", "user", "project", preset("move"), ctx, writeScope),
    ).rejects.toBe(sourceError);
    expect(writeScope).toHaveBeenCalledTimes(3);
    expect(
      (await loadPresetsConfig(ctx)).presets.map(
        (entry) => `${entry.scope}:${entry.name}`,
      ),
    ).toEqual(["user:move", "project:keep"]);
  });

  it("reports both errors when the source write and rollback fail", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const sourceError = new Error("source write failed");
    const rollbackError = new Error("rollback failed");
    const writeScope = vi.fn<typeof saveScope>(
      async (scope, presets, context) => {
        if (writeScope.mock.calls.length === 2) throw sourceError;
        if (writeScope.mock.calls.length === 3) throw rollbackError;
        await saveScope(scope, presets, context);
      },
    );

    await saveScope("user", [preset("move")], ctx);
    await saveScope("project", [preset("keep")], ctx);

    let thrown: unknown;

    try {
      await movePreset(
        "move",
        "user",
        "project",
        preset("move"),
        ctx,
        writeScope,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);

    if (!(thrown instanceof AggregateError)) {
      throw new Error("Expected movePreset to throw AggregateError.");
    }

    expect(thrown.errors).toEqual([sourceError, rollbackError]);
    expect(thrown.message).toBe(
      "The preset move failed, and Presets Plus could not restore the destination scope.",
    );

    expect(
      (await loadPresetsConfig(ctx)).presets.map(
        (entry) => `${entry.scope}:${entry.name}`,
      ),
    ).toEqual(["user:move", "project:keep", "project:move"]);
  });
});

describe("removePreset", () => {
  it("removes an entry and preserves the complete document", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = {
      version: 2,
      showInactiveStatus: true,
      policy: { rules: [] },
      unknown: "retained",
      presets: [preset("a"), preset("b")],
    };
    const path = await writeRawScope("user", JSON.stringify(original));

    const result = await removePreset("a", "user", ctx);

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(await readFile(path, "utf-8"))).toEqual({
      ...original,
      presets: [preset("b")],
    });
  });

  it("is a no-op when the entry does not exist (idempotent)", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a")], ctx);

    const result = await removePreset("missing", "user", ctx);

    expect(result).toEqual({ ok: true });
    expect(
      (await loadPresetsConfig(ctx)).presets.map((entry) => entry.name),
    ).toEqual(["a"]);
  });
});

describe("reorderWithinScope", () => {
  it("rewrites the file in the requested order and preserves its sections", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = {
      version: 2,
      showInactiveStatus: false,
      policy: { rules: [{ match: "work" }] },
      unknown: [1, 2],
      presets: [preset("a"), preset("b"), preset("c")],
    };
    const path = await writeRawScope("user", JSON.stringify(original));

    const result = await reorderWithinScope("user", ["c", "a", "b"], ctx);

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(await readFile(path, "utf-8"))).toEqual({
      ...original,
      presets: [preset("c"), preset("a"), preset("b")],
    });
  });

  it("appends omitted names at the end in their original order", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b"), preset("c")], ctx);
    await reorderWithinScope("user", ["c"], ctx);
    expect(
      (await loadPresetsConfig(ctx)).presets.map((entry) => entry.name),
    ).toEqual(["c", "a", "b"]);
  });

  it("ignores names that don't match any existing preset", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);
    await reorderWithinScope("user", ["ghost", "b", "a"], ctx);
    expect(
      (await loadPresetsConfig(ctx)).presets.map((entry) => entry.name),
    ).toEqual(["b", "a"]);
  });

  it("ignores duplicate names within the requested order", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);
    await reorderWithinScope("user", ["a", "a", "b"], ctx);
    expect(
      (await loadPresetsConfig(ctx)).presets.map((entry) => entry.name),
    ).toEqual(["a", "b"]);
  });
});

describe("unsafe mutation protection", () => {
  it("allows add when the scope file is missing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    expect(await addPreset(preset("plan"), "project", ctx)).toEqual({
      ok: true,
    });

    expect(
      (await loadPresetsConfig(ctx)).presets.map((entry) => entry.name),
    ).toEqual(["plan"]);
  });

  it("rejects add and preserves an invalid showInactiveStatus", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = JSON.stringify({ version: 2, showInactiveStatus: "yes" });
    const path = await writeRawScope("project", original);

    const result = await addPreset(preset("plan"), "project", ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects add when the scope path cannot be read as a file", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const path = presetPath("user");

    await mkdir(path, { recursive: true });

    const result = await addPreset(preset("plan"), "user", ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("user", path),
    });
    expect((await stat(path)).isDirectory()).toBe(true);
  });

  it("rejects update and preserves invalid JSON", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = "{ not json";
    const path = await writeRawScope("user", original);

    const result = await updatePreset("plan", "user", preset("plan"), ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("user", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects remove and preserves an unsupported version", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = JSON.stringify({ presets: [preset("plan")], version: 3 });
    const path = await writeRawScope("project", original);

    const result = await removePreset("plan", "project", ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects reorder and preserves invalid top-level structure", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = "[]";
    const path = await writeRawScope("project", original);

    const result = await reorderWithinScope("project", ["plan"], ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects move and preserves a source with an invalid entry", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const source = JSON.stringify({
      presets: [preset("move"), { name: "broken", provider: "anthropic" }],
      version: 2,
    });
    const sourcePath = await writeRawScope("user", source);

    await saveScope("project", [preset("keep")], ctx);

    const destinationPath = presetPath("project");
    const destination = await readFile(destinationPath, "utf-8");
    const writeScope = vi.fn<typeof saveScope>();
    const result = await movePreset(
      "move",
      "user",
      "project",
      preset("move"),
      ctx,
      writeScope,
    );

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("user", sourcePath),
    });
    expect(writeScope).not.toHaveBeenCalled();
    expect(await readFile(sourcePath, "utf-8")).toBe(source);
    expect(await readFile(destinationPath, "utf-8")).toBe(destination);
  });

  it.each([
    ["a rule does not compile", { rules: [{ match: "[" }] }],
    ["the policy section is malformed", { rules: "work" }],
  ])("rejects user mutation when %s", async (_label, policy) => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = JSON.stringify({
      version: 2,
      policy,
      presets: [preset("keep")],
    });
    const path = await writeRawScope("user", original);

    const result = await addPreset(preset("new"), "user", ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("user", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects project mutations when policy is present", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = JSON.stringify({
      version: 2,
      policy: { rules: [] },
      presets: [preset("keep")],
    });
    const path = await writeRawScope("project", original);

    expect(await addPreset(preset("new"), "project", ctx)).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", path),
    });

    expect(
      await updatePreset("keep", "project", preset("changed"), ctx),
    ).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects move and preserves a destination with duplicate names", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("move")], ctx);

    const sourcePath = presetPath("user");
    const source = await readFile(sourcePath, "utf-8");
    const destination = JSON.stringify({
      presets: [preset("keep"), preset("keep")],
      version: 2,
    });
    const destinationPath = await writeRawScope("project", destination);
    const writeScope = vi.fn<typeof saveScope>();
    const result = await movePreset(
      "move",
      "user",
      "project",
      preset("move"),
      ctx,
      writeScope,
    );

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", destinationPath),
    });
    expect(writeScope).not.toHaveBeenCalled();
    expect(await readFile(sourcePath, "utf-8")).toBe(source);
    expect(await readFile(destinationPath, "utf-8")).toBe(destination);
  });
});
