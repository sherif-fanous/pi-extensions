/**
 * Covers activating a preset through `activate` and `activateAtStartup`:
 * how each trigger finds its preset, checks the access policy, applies it
 * to Pi, and shows the outcome, and the order session start runs its
 * restore, `--preset`, and policy-default steps in. Runs against real
 * temporary config files and a fake Pi.
 */
import { join } from "node:path";

import {
  activate,
  activateAtStartup,
  type ActivationRequest,
  type ActivationTrigger,
} from "../../src/activation/activate.js";
import { ActivePresetSession } from "../../src/activation/session.js";
import type { StartupSelection } from "../../src/activation/startup-selection.js";
import { loadPresetsConfig } from "../../src/store/api.js";
import type { ThinkingLevel } from "../../src/types.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionContext,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakeCustom,
  createFakePi,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A preset as the config file stores it. */
interface StoredPreset {
  readonly model: string;
  readonly name: string;
  readonly provider: string;
  readonly thinkingLevel?: ThinkingLevel;
  readonly tools?: readonly string[];
}

/** Pi's startup model and thinking level, matching the settings file. */
const STARTUP: StartupSelection = {
  model: { id: "gpt", provider: "openai" },
  thinkingLevel: "medium",
};

let dirs: TempConfigDirs;

/**
 * A fake Pi and context that keep the model, thinking level, and tools
 * they are given, with an override dialog answered by `keys`.
 */
function harness(
  options: {
    readonly branch?: readonly unknown[];
    readonly flag?: string;
    readonly keys?: readonly string[];
    readonly mode?: ExtensionContext["mode"];
    readonly modelAccepted?: boolean;
  } = {},
) {
  const notify = vi.fn();
  const rendered: string[] = [];
  const custom = createFakeCustom({ keys: options.keys ?? ["n"], rendered });
  const ctx = createFakeContext({
    cwd: dirs.cwd,
    mode: options.mode ?? "tui",
    model: { id: "gpt", provider: "openai" } as Model<Api>,
    modelRegistry: makeStubModelRegistry({
      models: {
        anthropic: {
          claude: { hasKey: true, reasoning: true },
          locked: { hasKey: false },
        },
        openai: { gpt: { hasKey: true, reasoning: true } },
      },
    }),
    sessionManager: {
      getBranch: () =>
        (options.branch ?? []) as ReturnType<
          ExtensionContext["sessionManager"]["getBranch"]
        >,
    },
    ui: { custom, notify },
  });
  let thinkingLevel: ThinkingLevel = "medium";
  let activeTools = ["read", "bash"];
  const setActiveTools = vi.fn((tools: string[]) => {
    activeTools = tools;
  });
  const setModel = vi.fn((model: Model<Api>) => {
    if (options.modelAccepted === false) return Promise.resolve(false);

    Object.assign(ctx, { model });

    return Promise.resolve(true);
  });
  const setThinkingLevel = vi.fn((level: ThinkingLevel) => {
    thinkingLevel = level;
  });
  const fake = createFakePi({
    getActiveTools: () => activeTools,
    getAllTools: () => ["bash", "read"].map((name) => ({ name }) as ToolInfo),
    getFlag: (name) => (name === "preset" ? options.flag : undefined),
    getThinkingLevel: () => thinkingLevel,
    setActiveTools,
    setModel,
    setThinkingLevel,
  });

  return {
    activated: () =>
      fake.appendedEntries
        .filter((entry) => entry.customType === "presets-plus:active")
        .map((entry) => entry.data),
    ctx,
    notify,
    pi: fake.pi,
    rendered,
    session: new ActivePresetSession(),
    setActiveTools,
    setModel,
    setThinkingLevel,
  };
}

/** A preset whose provider has no API key, so activation refuses it. */
function locked(name: string): StoredPreset {
  return { model: "locked", name, provider: "anthropic" };
}

/** The request each trigger sends for the user preset `name`. */
async function requestFor(
  trigger: ActivationTrigger,
  name: string,
): Promise<ActivationRequest> {
  switch (trigger) {
    case "command":
    case "flag":
      return { name, trigger };
    case "hotkey":
      return { name, scope: "user", trigger };

    case "picker": {
      const { presets } = await loadPresetsConfig(harness().ctx);
      const preset = presets.find((candidate) => candidate.name === name);

      if (!preset) throw new Error(`No preset named "${name}" on disk.`);

      return { preset, trigger };
    }
  }
}

/** A preset on the `anthropic/claude` model, which has an API key. */
function stored(name: string, extra: Partial<StoredPreset> = {}): StoredPreset {
  return { model: "claude", name, provider: "anthropic", ...extra };
}

/** Make Pi's file-backed defaults match {@link STARTUP}. */
async function writePiDefaults(): Promise<void> {
  await dirs.writeJson(join(dirs.agentDir, "settings.json"), {
    defaultModel: "gpt",
    defaultProvider: "openai",
    defaultThinkingLevel: "medium",
  });
}

async function writeProject(presets: readonly unknown[]): Promise<void> {
  await dirs.writeJson(join(dirs.cwd, ".pi", "presets-plus", "config.json"), {
    presets,
    version: 2,
  });
}

async function writeUser(
  presets: readonly unknown[],
  policyRules?: readonly unknown[],
): Promise<void> {
  await dirs.writeJson(join(dirs.agentDir, "presets-plus", "config.json"), {
    presets,
    version: 2,
    ...(policyRules ? { policy: { rules: policyRules } } : {}),
  });
}

beforeEach(async () => {
  dirs = await createTempConfigDirs();
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("activate", () => {
  it("applies a named preset's model, thinking level, and tools", async () => {
    await writeUser([
      stored("plan", { thinkingLevel: "high", tools: ["read"] }),
    ]);

    const setup = harness();

    await expect(
      activate(setup.ctx, setup.pi, setup.session, {
        name: "plan",
        trigger: "command",
      }),
    ).resolves.toEqual({ kind: "applied", warnings: [] });

    expect(setup.setModel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "claude", provider: "anthropic" }),
    );
    expect(setup.setThinkingLevel).toHaveBeenCalledWith("high");
    expect(setup.setActiveTools).toHaveBeenCalledWith(["read"]);
    expect(setup.activated()).toEqual([
      expect.objectContaining({ name: "plan", scope: "user" }),
    ]);

    expect(setup.notify).toHaveBeenCalledExactlyOnceWith(
      'Preset "plan" applied.',
      "info",
    );
  });

  it.each([
    ["command", 'Preset "plan" applied.'],
    ["picker", 'Preset "plan" applied.'],
    ["hotkey", 'Presets Plus applied preset "plan".'],
    ["flag", 'Presets Plus applied preset "plan".'],
  ] as const)("words a %s activation as %j", async (trigger, message) => {
    await writeUser([stored("plan")]);

    const setup = harness();

    await activate(
      setup.ctx,
      setup.pi,
      setup.session,
      await requestFor(trigger, "plan"),
    );

    expect(setup.notify).toHaveBeenCalledExactlyOnceWith(message, "info");
  });

  it("activates the project preset when a user preset shares its name", async () => {
    await writeUser([stored("plan")]);
    await writeProject([stored("plan")]);

    const setup = harness();

    await activate(setup.ctx, setup.pi, setup.session, {
      name: "plan",
      trigger: "command",
    });

    expect(setup.activated()).toEqual([
      expect.objectContaining({ name: "plan", scope: "project" }),
    ]);
  });

  it("stays silent when the preset is already active and unchanged", async () => {
    await writeUser([stored("plan")]);

    const setup = harness();
    const request = { name: "plan", trigger: "command" } as const;

    await activate(setup.ctx, setup.pi, setup.session, request);
    setup.notify.mockClear();

    await expect(
      activate(setup.ctx, setup.pi, setup.session, request),
    ).resolves.toEqual({
      kind: "applied",
      warnings: [],
    });
    expect(setup.notify).not.toHaveBeenCalled();
    expect(setup.activated()).toHaveLength(1);
  });

  it("uses the configuration it is given instead of reading the files", async () => {
    await writeUser([stored("plan")]);

    const setup = harness();
    const config = await loadPresetsConfig(setup.ctx);

    await writeUser([]);

    await expect(
      activate(setup.ctx, setup.pi, setup.session, {
        config,
        name: "plan",
        trigger: "command",
      }),
    ).resolves.toMatchObject({ kind: "applied" });
  });

  it("shows the configuration's warnings when a command names no preset", async () => {
    await writeUser([{ name: "plan" }]);

    const setup = harness();

    await expect(
      activate(setup.ctx, setup.pi, setup.session, {
        name: "plan",
        trigger: "command",
      }),
    ).resolves.toEqual({ kind: "unknown", warnings: [] });

    expect(setup.notify.mock.calls).toEqual([
      [
        expect.stringMatching(
          /^Presets Plus: 1 warning\n- Skipped preset "plan"/u,
        ),
        "warning",
      ],
    ]);
  });

  it("does not repeat the configuration's warnings when the command finds its preset", async () => {
    await writeUser([stored("plan"), { name: "broken" }]);

    const setup = harness();

    await activate(setup.ctx, setup.pi, setup.session, {
      name: "plan",
      trigger: "command",
    });

    expect(setup.notify).not.toHaveBeenCalledWith(expect.anything(), "warning");
  });

  it.each(["command", "hotkey", "flag"] as const)(
    "reports a %s activation that Pi refuses as one error",
    async (trigger) => {
      await writeUser([locked("plan")]);

      const setup = harness();

      await expect(
        activate(
          setup.ctx,
          setup.pi,
          setup.session,
          await requestFor(trigger, "plan"),
        ),
      ).resolves.toMatchObject({ kind: "refused", warnings: [] });

      expect(setup.notify).toHaveBeenCalledExactlyOnceWith(
        'Preset "plan" is unavailable because its provider has no API key. Pi did not activate it.',
        "error",
      );
      expect(setup.activated()).toEqual([]);
    },
  );

  it("hands a refusal back to the picker without a notification", async () => {
    await writeUser([locked("plan")]);

    const setup = harness();

    await expect(
      activate(
        setup.ctx,
        setup.pi,
        setup.session,
        await requestFor("picker", "plan"),
      ),
    ).resolves.toEqual({
      kind: "refused",
      reason:
        'Preset "plan" is unavailable because its provider has no API key. Pi did not activate it.',
      warnings: [],
    });
    expect(setup.notify).not.toHaveBeenCalled();
  });

  it("activates a permitted preset without asking", async () => {
    await writeUser(
      [stored("plan")],
      [{ allow: [{ pattern: "^plan$" }], match: "project$" }],
    );

    const setup = harness();

    await activate(setup.ctx, setup.pi, setup.session, {
      name: "plan",
      trigger: "command",
    });

    expect(setup.rendered).toEqual([]);
    expect(setup.activated()).toHaveLength(1);
  });

  it.each(["command", "hotkey", "picker", "flag"] as const)(
    "stays silent when the user cancels the %s override",
    async (trigger) => {
      await writeUser(
        [stored("plan")],
        [{ match: "project$", prohibit: [{ pattern: "^plan$" }] }],
      );

      const setup = harness({ keys: ["n"] });

      await expect(
        activate(
          setup.ctx,
          setup.pi,
          setup.session,
          await requestFor(trigger, "plan"),
        ),
      ).resolves.toEqual({ kind: "cancelled", warnings: [] });
      expect(setup.rendered[0]).toContain("Preset Doesn't Match Policy");
      expect(setup.setModel).not.toHaveBeenCalled();
      expect(setup.activated()).toEqual([]);
      expect(setup.notify).not.toHaveBeenCalled();
    },
  );

  it("applies a prohibited preset when the user overrides the policy", async () => {
    await writeUser(
      [stored("plan")],
      [{ match: "project$", prohibit: [{ pattern: "^plan$" }] }],
    );

    const setup = harness({ keys: ["y"] });

    await expect(
      activate(
        setup.ctx,
        setup.pi,
        setup.session,
        await requestFor("picker", "plan"),
      ),
    ).resolves.toEqual({ kind: "applied", warnings: [] });
    expect(setup.rendered[0]).toContain("Preset Doesn't Match Policy");
    expect(setup.activated()).toHaveLength(1);
  });

  it("notifies a command's warnings and hands the flag's back", async () => {
    await writeUser([stored("plan", { tools: ["read", "missing"] })]);

    const warning = 'Ignored unknown tools for preset "plan": missing.';
    const command = harness();
    const flag = harness();

    await activate(command.ctx, command.pi, command.session, {
      name: "plan",
      trigger: "command",
    });

    await expect(
      activate(flag.ctx, flag.pi, flag.session, {
        name: "plan",
        trigger: "flag",
      }),
    ).resolves.toEqual({ kind: "applied", warnings: [warning] });

    expect(command.notify).toHaveBeenCalledWith(
      `Presets Plus: 1 warning\n- ${warning}`,
      "warning",
    );

    expect(flag.notify).toHaveBeenCalledExactlyOnceWith(
      'Presets Plus applied preset "plan".',
      "info",
    );
  });

  it("keeps a hotkey on its user preset after a project preset of that name appears", async () => {
    await writeUser([stored("plan")]);
    await writeProject([stored("plan")]);

    const setup = harness();

    await activate(setup.ctx, setup.pi, setup.session, {
      name: "plan",
      scope: "user",
      trigger: "hotkey",
    });

    expect(setup.activated()).toEqual([
      expect.objectContaining({ name: "plan", scope: "user" }),
    ]);
  });

  it("warns that a hotkey's preset no longer exists after it moved scope", async () => {
    await writeUser([]);
    await writeProject([stored("plan")]);

    const setup = harness();

    await expect(
      activate(setup.ctx, setup.pi, setup.session, {
        name: "plan",
        scope: "user",
        trigger: "hotkey",
      }),
    ).resolves.toEqual({ kind: "unknown", warnings: [] });
    expect(setup.activated()).toEqual([]);
    expect(setup.notify).toHaveBeenCalledExactlyOnceWith(
      'Presets Plus: 1 warning\n- Preset "plan" no longer exists.',
      "warning",
    );
  });
});

describe("activateAtStartup", () => {
  /** Run the startup steps and return the warnings they collected. */
  async function start(
    setup: ReturnType<typeof harness>,
    startup: StartupSelection = STARTUP,
  ): Promise<string[]> {
    const warnings: string[] = [];

    await activateAtStartup(
      setup.ctx,
      setup.pi,
      setup.session,
      await loadPresetsConfig(setup.ctx),
      startup,
      warnings,
    );

    return warnings;
  }

  /** A session branch whose last active preset is the user preset `name`. */
  function restoring(name: string): readonly unknown[] {
    return [
      {
        customType: "presets-plus:active",
        data: { name, scope: "user" },
        type: "custom",
      },
    ];
  }

  /** A policy rule for the test's directory that defaults to `pattern`. */
  function defaultRule(pattern: string) {
    return { default: { pattern }, match: "project$" };
  }

  beforeEach(async () => {
    await writePiDefaults();
  });

  it("applies the policy default when nothing else claimed the session", async () => {
    await writeUser([stored("work")], [defaultRule("^work$")]);

    const setup = harness();

    await expect(start(setup)).resolves.toEqual([]);
    expect(setup.activated()).toEqual([
      expect.objectContaining({ name: "work", scope: "user" }),
    ]);

    expect(setup.notify).toHaveBeenCalledExactlyOnceWith(
      'Presets Plus applied preset "work".',
      "info",
    );
  });

  it.each([
    ["Pi runs without the TUI", "print", STARTUP],
    [
      "Pi started on another model",
      "tui",
      { ...STARTUP, model: { id: "claude", provider: "anthropic" } },
    ],
  ] as const)(
    "skips the policy default when %s",
    async (_label, mode, startup) => {
      await writeUser([stored("work")], [defaultRule("^work$")]);

      const setup = harness({ mode });

      await expect(start(setup, startup)).resolves.toEqual([]);
      expect(setup.setModel).not.toHaveBeenCalled();
      expect(setup.notify).not.toHaveBeenCalled();
    },
  );

  it("does not warn about an unresolvable default this startup can't take", async () => {
    await writeUser([stored("work")], [defaultRule("^missing$")]);

    await expect(start(harness({ mode: "print" }))).resolves.toEqual([]);
  });

  it("keeps a restored preset attached without applying the default", async () => {
    await writeUser([stored("plan"), stored("work")], [defaultRule("^work$")]);

    const setup = harness({ branch: restoring("plan") });

    await expect(start(setup)).resolves.toEqual([]);
    expect(setup.session.current()).toMatchObject({
      name: "plan",
      scope: "user",
    });
    expect(setup.setModel).not.toHaveBeenCalled();
    expect(setup.notify).not.toHaveBeenCalled();
  });

  it("applies --preset over a restored preset and skips the default", async () => {
    await writeUser(
      [stored("plan"), stored("review"), stored("work")],
      [defaultRule("^work$")],
    );

    const setup = harness({ branch: restoring("plan"), flag: "  review  " });

    await expect(start(setup)).resolves.toEqual([]);
    expect(setup.activated()).toEqual([
      expect.objectContaining({ name: "review", scope: "user" }),
    ]);

    expect(setup.notify).toHaveBeenCalledExactlyOnceWith(
      'Presets Plus applied preset "review".',
      "info",
    );
  });

  it("applies the default when --preset names no preset", async () => {
    await writeUser([stored("work")], [defaultRule("^work$")]);

    const setup = harness({ flag: "bad" });

    await expect(start(setup)).resolves.toEqual([
      'Unknown preset "bad" for --preset. Available: work.',
    ]);

    expect(setup.activated()).toEqual([
      expect.objectContaining({ name: "work", scope: "user" }),
    ]);
  });

  it("lists each available name once, marking unavailable ones, for an unknown --preset", async () => {
    await writeUser([stored("plan"), stored("review")]);
    await writeProject([stored("plan"), locked("draft")]);

    const setup = harness({ flag: "bad", mode: "print" });

    await expect(start(setup)).resolves.toEqual([
      'Unknown preset "bad" for --preset. Available: plan, review, draft (Unavailable: no-key).',
    ]);
    expect(setup.notify).not.toHaveBeenCalled();
  });

  it("collects the restore, --preset, and policy-default warnings in that order", async () => {
    await writeUser([stored("plan")], [defaultRule("^missing$")]);

    const setup = harness({ branch: restoring("gone"), flag: "bad" });

    await expect(start(setup)).resolves.toEqual([
      'The restored session references preset "gone", which is not loaded. Did not attach it.',
      'Unknown preset "bad" for --preset. Available: plan.',
      'The default from rule 1 ("project$") does not match any permitted preset that is available. Kept the baseline.',
    ]);
    expect(setup.notify).not.toHaveBeenCalled();
  });

  it("keeps Pi's model with a warning when the default can't be applied", async () => {
    await writeUser([stored("work")], [defaultRule("^work$")]);

    const setup = harness({ modelAccepted: false });

    await expect(start(setup)).resolves.toEqual([
      "Pi has no API key configured for anthropic/claude.",
    ]);
    expect(setup.activated()).toEqual([]);
    expect(setup.notify).not.toHaveBeenCalled();
  });
});
