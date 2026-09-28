/**
 * Covers the `/presets status` report: its delivery by `runStatus`, and
 * the rows, severity, Config block, and warnings `statusReport` builds for
 * no active preset, a preset no longer loaded, a baseline, and a restored
 * session without one. Presets load from real temporary config files.
 */
import { join } from "node:path";

import {
  ActivePresetSession,
  type ActivePresetStartOptions,
} from "../../../src/activation/session.js";
import {
  runStatus,
  statusReport,
} from "../../../src/commands/presets/status.js";
import { toPersistedPreset } from "../../../src/store/api.js";
import type { LoadedPreset } from "../../../src/types.js";
import { makeStubModelRegistry } from "../../helpers/model-registry.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  createPlainTheme,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preset: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

let dirs: TempConfigDirs;

/** A context outside the TUI whose current model is `current`. */
function context(current?: Model<Api>) {
  const notify = vi.fn();

  return {
    ctx: {
      cwd: dirs.cwd,
      isProjectTrusted: () => true,
      model: current,
      modelRegistry: makeStubModelRegistry({
        models: { anthropic: { claude: { hasKey: true, reasoning: true } } },
      }),
      ui: { notify, setStatus: vi.fn(), theme: createPlainTheme() },
    } as never,
    notify,
  };
}

function model(provider: string, id: string): Model<Api> {
  return { id, provider, reasoning: true } as Model<Api>;
}

function pi(thinkingLevel: string, tools: string[]) {
  return {
    appendEntry: vi.fn(),
    getActiveTools: () => tools,
    getThinkingLevel: () => thinkingLevel as never,
  };
}

/** A session restored from a branch, which carries no baseline. */
function restoredSession(): ActivePresetSession {
  const session = new ActivePresetSession();

  session.restoreFromBranch(
    [
      {
        customType: "presets-plus:active",
        data: { name: preset.name, scope: preset.scope },
        type: "custom",
      },
    ] as never,
    [preset],
    context().ctx,
  );

  return session;
}

/** A session that started `preset` over the given baseline. */
function startedSession(
  options: Omit<ActivePresetStartOptions, "applyCount" | "preset">,
): ActivePresetSession {
  const session = new ActivePresetSession();

  session.start(
    { ...options, applyCount: 1, preset },
    context().ctx,
    pi("high", []),
  );

  return session;
}

function userPath(): string {
  return join(dirs.agentDir, "presets-plus", "config.json");
}

/** Save `preset` to the project file, which stores it without its scope. */
async function writePreset(): Promise<void> {
  await dirs.writeJson(join(dirs.cwd, ".pi", "presets-plus", "config.json"), {
    version: 2,
    presets: [toPersistedPreset(preset)],
  });
}

beforeEach(async () => {
  dirs = await createTempConfigDirs();
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("runStatus", () => {
  it("delivers the status report as a notification outside the TUI", async () => {
    const { ctx, notify } = context();

    await runStatus(ctx, pi("medium", []) as never, new ActivePresetSession());

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("No preset is active."),
      "info",
    );
  });
});

describe("statusReport", () => {
  it("says no preset is active, with the Config block and the configuration's warnings", async () => {
    await dirs.writeJson(userPath(), { version: 2, presets: [{}] });

    const report = await statusReport(
      context().ctx,
      pi("medium", []),
      new ActivePresetSession(),
    );

    expect(report.title).toBe("Presets Plus Status");
    expect(report.body.startsWith(`${report.title}\n`)).toBe(true);
    expect(report.body).toContain("No preset is active.");
    expect(report.body).toContain(
      [
        "Config:",
        "  User:    loaded",
        `           ${userPath()}`,
        "  Project: not found",
        `           ${join(dirs.cwd, ".pi", "presets-plus", "config.json")}`,
      ].join("\n"),
    );

    expect(report.body).toContain(
      `Warnings:\n- Skipped preset at index 0 in ${userPath()}: `,
    );
    expect(report.severity).toBe("info");
  });

  it("warns when the active preset is no longer loaded", async () => {
    const report = await statusReport(
      context().ctx,
      pi("high", []),
      restoredSession(),
    );

    expect(report.body).toContain('Active preset "plan" is no longer loaded.');
    expect(report.severity).toBe("warning");
  });

  it("shows the baseline, the preset's values, and the managed current values", async () => {
    await writePreset();

    const session = startedSession({
      baseline: {
        model: { provider: "anthropic", id: "old" },
        thinkingLevel: "medium",
        tools: ["bash"],
      },
      lastApplied: {
        model: { provider: "anthropic", id: "claude" },
        thinkingLevel: "high",
        tools: ["read"],
      },
      owned: { model: true, thinkingLevel: true, tools: true },
    });
    const { body, severity } = await statusReport(
      context(model("anthropic", "claude")).ctx,
      pi("high", ["read"]),
      session,
    );

    expect(body).toContain("Preset:                  plan");
    expect(body).toContain("Scope:                   Project");
    expect(body).toContain("Baseline model:          anthropic/old");
    expect(body).toContain("Baseline thinking level: medium");
    expect(body).toContain("Baseline tools:          bash");
    expect(body).toContain("Preset model:            anthropic/claude");
    expect(body).toContain("Preset thinking level:   high");
    expect(body).toContain("Preset tools:            read");
    expect(body).toContain(
      "Current model:           anthropic/claude (Managed by active preset)",
    );

    expect(body).toContain(
      "Current thinking level:  high (Managed by active preset)",
    );

    expect(body).toContain(
      "Current tools:           read (Managed by active preset)",
    );
    expect(severity).toBe("info");
  });

  it("flags user overrides and tools the preset does not manage", async () => {
    await writePreset();

    const session = startedSession({
      baseline: {
        model: { provider: "anthropic", id: "old" },
        thinkingLevel: "medium",
        tools: ["bash"],
      },
      lastApplied: {
        model: { provider: "anthropic", id: "claude" },
        thinkingLevel: "high",
      },
      owned: { model: true, thinkingLevel: true, tools: false },
    });
    const { body } = await statusReport(
      context(model("openai", "gpt")).ctx,
      pi("low", ["foo"]),
      session,
    );

    expect(body).toContain(
      "Current model:           openai/gpt (Left as-is because you changed it after activation)",
    );

    expect(body).toContain(
      "Current thinking level:  low (Left as-is because you changed it after activation)",
    );

    expect(body).toContain(
      "Current tools:           foo (Not managed by active preset)",
    );
  });

  it("leaves out the baseline and preset rows for a session without a baseline", async () => {
    await writePreset();

    const { body } = await statusReport(
      context(model("anthropic", "claude")).ctx,
      pi("high", ["read"]),
      restoredSession(),
    );

    expect(body).toContain(
      "Restore:                No saved baseline. Clear will only turn the preset off.",
    );
    expect(body).not.toContain("Baseline model");
    expect(body).not.toContain("Preset model:");
    expect(body).toContain("Current model:          anthropic/claude");
  });
});
