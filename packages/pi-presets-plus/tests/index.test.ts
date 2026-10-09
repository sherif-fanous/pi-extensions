/**
 * Covers session-start configuration loading, warning delivery, and picking
 * up an externally edited configuration on extension reload, against real
 * temporary config files.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import presetsPlus from "../src/index.js";
import { toPersistedPreset } from "../src/store/api.js";
import type { LoadedPreset, ThinkingLevel } from "../src/types.js";
import { makeStubModelRegistry } from "./helpers/model-registry.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionContext,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakePi,
  createTempConfigDirs,
  type FakePi,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dirs: TempConfigDirs;
let agentDir: string;

function configPath(scope: "project" | "user", cwd: string): string {
  return scope === "user"
    ? join(agentDir, "presets-plus", "config.json")
    : join(cwd, ".pi", "presets-plus", "config.json");
}

function makeContext(
  status: Record<string, string | undefined>,
  mode: ExtensionContext["mode"] = "tui",
  branch: ReturnType<ExtensionContext["sessionManager"]["getBranch"]> = [],
  trusted = true,
) {
  const notify = vi.fn();
  const ctx = createFakeContext({
    cwd: join(agentDir, "project"),
    isProjectTrusted: () => trusted,
    mode,
    model: { id: "gpt-5", provider: "openai" } as Model<Api>,
    modelRegistry: makeStubModelRegistry({
      models: {
        anthropic: { "claude-opus": { hasKey: true } },
        openai: { "gpt-5": { hasKey: true, reasoning: true } },
      },
    }),
    sessionManager: { getBranch: () => branch },
    ui: {
      notify,
      setStatus: (key, value) => {
        status[key] = value;
      },
    },
  });

  return { ctx, notify };
}

function makePi() {
  const spies = {
    getThinkingLevel: vi.fn((): ThinkingLevel => "medium"),
    setActiveTools: vi.fn(),
    setModel: vi.fn(() => Promise.resolve(true)),
    setThinkingLevel: vi.fn(),
  };
  const fake = createFakePi({
    ...spies,
    getActiveTools: () => ["read", "bash"],
  });

  return { fake, spies };
}

function projectPresetsPath(cwd: string): string {
  return join(cwd, ".pi", "presets-plus", "presets.json");
}

async function startSession(
  fake: FakePi,
  ctx: ExtensionContext,
  reason: SessionStartEvent["reason"] = "startup",
): Promise<void> {
  await fake.emit({ reason, type: "session_start" }, ctx);
}

async function writeConfig(contents: string): Promise<void> {
  const directory = join(agentDir, "presets-plus");

  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "config.json"), contents, "utf-8");
}

async function writeLegacyPresets(contents: string): Promise<void> {
  await mkdir(join(agentDir, "presets-plus"), { recursive: true });
  await writeFile(
    join(agentDir, "presets-plus", "presets.json"),
    contents,
    "utf-8",
  );
}

async function writeProjectLegacyPresets(
  contents: string,
  cwd: string,
): Promise<void> {
  await mkdir(join(cwd, ".pi", "presets-plus"), { recursive: true });
  await writeFile(projectPresetsPath(cwd), contents, "utf-8");
}

/** Save `presets` to the user file, which stores them without a scope. */
async function writeUserPresets(
  presets: readonly LoadedPreset[],
  extra: Record<string, unknown> = {},
): Promise<void> {
  await dirs.writeJson(configPath("user", ""), {
    version: 2,
    presets: presets.map(toPersistedPreset),
    ...extra,
  });
}

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  agentDir = dirs.agentDir;
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("/presets command", () => {
  it("reports a failing subcommand as an error notification", async () => {
    const { fake } = makePi();
    const { ctx, notify } = makeContext({});

    ctx.isProjectTrusted = () => {
      throw new Error("disk on fire");
    };

    presetsPlus(fake.pi);
    await fake.runCommand("presets", "reload", ctx);

    expect(notify).toHaveBeenCalledWith(
      "Presets Plus command failed: disk on fire.",
      "error",
    );
  });
});

describe("session_start configuration", () => {
  it("applies the inactive preference and re-reads it after reload", async () => {
    await writeConfig(
      JSON.stringify({ version: 2, showInactiveStatus: false }),
    );

    const { fake } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx } = makeContext(status);

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    expect(status["presets-plus"]).toBeUndefined();

    await writeConfig(JSON.stringify({ version: 2, showInactiveStatus: true }));

    // Pi loads the extension again, with a new API, on reload.
    const reloaded = makePi().fake;

    presetsPlus(reloaded.pi);
    await startSession(reloaded, ctx, "reload");

    expect(status["presets-plus"]).toBe("Preset: none");
  });

  it("reports one successful migration notification", async () => {
    await writeLegacyPresets(JSON.stringify({ version: 1, presets: [] }));

    const { fake } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status);

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    expect(notify).toHaveBeenCalledWith(
      `Presets Plus migrated its configuration to ${join(agentDir, "presets-plus", "config.json")}.`,
      "info",
    );
  });

  it("warns when a scope migration fails", async () => {
    await writeLegacyPresets("{");

    const { fake } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status);

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("README"),
      "warning",
    );
  });

  it("reports a successful migration as info and a failed one as a warning", async () => {
    const cwd = join(agentDir, "project");

    await writeLegacyPresets(JSON.stringify({ version: 1, presets: [] }));
    await writeProjectLegacyPresets("{", cwd);

    const { fake } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status);

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    expect(notify).toHaveBeenCalledWith(
      `Presets Plus migrated its configuration to ${join(agentDir, "presets-plus", "config.json")}.`,
      "info",
    );

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("README"),
      "warning",
    );
  });

  it.each(["startup", "reload", "new", "resume", "fork"] as const)(
    "captures startup values before %s preset processing",
    async (reason) => {
      await dirs.writeJson(join(agentDir, "settings.json"), {
        defaultModel: "gpt-5",
        defaultProvider: "openai",
        defaultThinkingLevel: "medium",
      });

      await writeUserPresets(
        [
          {
            model: "claude-opus",
            name: "work",
            provider: "anthropic",
            scope: "user",
          },
        ],
        {
          policy: { rules: [{ default: { pattern: "^work$" }, match: ".*" }] },
        },
      );

      const { fake, spies } = makePi();
      const status: Record<string, string | undefined> = {};
      const { ctx, notify } = makeContext(status);

      // Pi's model and thinking level change once the configuration
      // starts loading, which asks whether the project is trusted.
      ctx.isProjectTrusted = () => {
        Object.assign(ctx, {
          model: { id: "claude-opus", provider: "anthropic" },
        });
        spies.getThinkingLevel.mockReturnValue("high");

        return true;
      };

      presetsPlus(fake.pi);
      await startSession(fake, ctx, reason);

      expect(notify).toHaveBeenCalledWith(
        'Presets Plus applied preset "work".',
        "info",
      );
    },
  );

  it("keeps an SDK-shaped print session unchanged through the next turn", async () => {
    const directoryDefault: LoadedPreset = {
      hotkey: "ctrl+2",
      instructions: "Use the directory default.",
      model: "claude-opus",
      name: "directory-default",
      provider: "anthropic",
      scope: "user",
      thinkingLevel: "high",
      tools: ["write"],
    };

    await writeUserPresets([directoryDefault], {
      policy: {
        rules: [
          {
            default: { pattern: "^directory-default$" },
            match: ".*",
          },
        ],
      },
    });

    const { fake, spies } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status, "print");

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    const beforeTurn = await fake.emit(
      {
        prompt: "",
        systemPrompt: "Baseline prompt.",
        systemPromptOptions: {
          appendSystemPrompt: "",
          contextFiles: [],
          cwd: ctx.cwd,
          hiddenTools: [],
          promptGuidelines: [],
          sections: {},
          selectedTools: [],
          skills: [],
          toolGuidelines: {},
          toolSnippets: {},
        },
        type: "before_agent_start",
      },
      ctx,
    );

    expect(spies.setModel).not.toHaveBeenCalled();
    expect(spies.setThinkingLevel).not.toHaveBeenCalled();
    expect(spies.setActiveTools).not.toHaveBeenCalled();
    expect(fake.appendedEntries).toEqual([]);
    expect(fake.shortcuts.size).toBeGreaterThan(0);
    expect(status["presets-plus"]).toBe("Preset: none");
    expect(beforeTurn).toEqual([undefined]);
    expect(notify).not.toHaveBeenCalledWith(
      expect.stringContaining("directory-default"),
      expect.anything(),
    );
  });

  it("names both migrated files in one info message", async () => {
    const cwd = join(agentDir, "project");

    await writeLegacyPresets(JSON.stringify({ version: 1, presets: [] }));
    await writeProjectLegacyPresets(
      JSON.stringify({ version: 1, presets: [] }),
      cwd,
    );

    const { fake } = makePi();
    const { ctx, notify } = makeContext({});

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    expect(notify).toHaveBeenCalledWith(
      `Presets Plus migrated its configuration to ${configPath("user", cwd)} and ${configPath("project", cwd)}.`,
      "info",
    );
  });

  it("skips a project configuration in an untrusted project with one warning", async () => {
    const cwd = join(agentDir, "project");
    const path = configPath("project", cwd);

    await mkdir(join(cwd, ".pi", "presets-plus"), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        presets: [
          { hotkey: "ctrl+alt+p", model: "m", name: "project", provider: "p" },
        ],
        showInactiveStatus: false,
      }),
    );

    const { fake } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status, "tui", [], false);

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    expect(notify.mock.calls).toEqual([
      [
        `Presets Plus: 1 warning\n- Skipped project configuration at ${path} because the project is not trusted. Trust the project to use it.`,
        "warning",
      ],
    ]);
    expect(status["presets-plus"]).toBe("Preset: none");
    expect(fake.shortcuts.size).toBe(0);
  });

  it("leaves a legacy project file in an untrusted project and warns about it", async () => {
    const cwd = join(agentDir, "project");
    const legacy = JSON.stringify({ version: 1, presets: [] });

    await writeProjectLegacyPresets(legacy, cwd);

    const { fake } = makePi();
    const { ctx, notify } = makeContext({}, "tui", [], false);

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    expect(notify.mock.calls).toEqual([
      [
        `Presets Plus: 1 warning\n- Skipped project configuration at ${projectPresetsPath(cwd)} because the project is not trusted. Trust the project to use it.`,
        "warning",
      ],
    ]);
    expect(await readFile(projectPresetsPath(cwd), "utf-8")).toBe(legacy);
    await expect(
      readFile(configPath("project", cwd), "utf-8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("shows user policy warnings once when a restored session skips the default", async () => {
    await writeUserPresets(
      [
        {
          model: "claude-opus",
          name: "restored",
          provider: "anthropic",
          scope: "user",
        },
      ],
      { policy: { rules: [{ match: "[" }] } },
    );

    const branch = [
      {
        customType: "presets-plus:active",
        data: { name: "restored", scope: "user" },
        type: "custom" as const,
      },
    ] as ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
    const { fake } = makePi();
    const { ctx, notify } = makeContext({}, "tui", branch);

    presetsPlus(fake.pi);
    await startSession(fake, ctx, "resume");

    const warnings = notify.mock.calls.filter(([, type]) => type === "warning");

    expect(warnings).toEqual([
      [
        `Presets Plus: 1 warning\n- Skipped policy rule 1 in ${configPath("user", "")}: match pattern "[" is invalid.`,
        "warning",
      ],
    ]);
  });

  it("shows user policy warnings on /presets reload", async () => {
    await writeUserPresets([], { policy: { rules: [{ match: "[" }] } });

    const { fake } = makePi();
    const { ctx, notify } = makeContext({});

    presetsPlus(fake.pi);
    await fake.runCommand("presets", "reload", ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Skipped policy rule 1 in"),
      "warning",
    );
  });

  it("warns about malformed configuration without skipping preset loading", async () => {
    const cwd = join(agentDir, "project");

    await writeConfig("{");
    await dirs.writeJson(configPath("project", cwd), {
      version: 2,
      presets: [
        {
          hotkey: "ctrl+alt+p",
          model: "claude-opus",
          name: "project",
          provider: "anthropic",
        },
      ],
    });

    const { fake } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status);

    presetsPlus(fake.pi);
    await startSession(fake, ctx);

    expect([...fake.shortcuts.keys()]).toEqual(["ctrl+alt+p"]);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("invalid JSON"),
      "warning",
    );
  });
});
