/**
 * Covers the `/presets status` report: its delivery by `runStatus`, and
 * the rows, severity, Config block, and warnings `statusReport` builds for
 * no active preset, a preset no longer loaded, a baseline, and a restored
 * session without one.
 */
import {
  ActivePresetSession,
  type ActivePresetStartOptions,
} from "../../../src/activation/session.js";
import {
  runStatus,
  statusReport,
} from "../../../src/commands/presets/status.js";
import type { LoadedPreset } from "../../../src/types.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import { createPlainTheme } from "@sherif-fanous/pi-extensions-testing";
import { afterEach, describe, expect, it, vi } from "vitest";

const loadAll = vi.hoisted(() => vi.fn());

vi.mock("../../../src/store/api.js", () => ({ loadAll }));

const preset: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

/** A context outside the TUI whose current model is `current`. */
function context(current?: Model<Api>) {
  const notify = vi.fn();

  return {
    ctx: {
      model: current,
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

const configLines = [
  "Config:",
  "  User:    loaded",
  "           /agent/presets-plus/config.json",
  "  Project: not found",
  "           /repo/.pi/presets-plus/config.json",
];

/** A `loadAll` result with the configuration members the report reads. */
function loaded(presets: LoadedPreset[], statusWarnings: string[] = []) {
  return { config: { statusLines: configLines, statusWarnings }, presets };
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

afterEach(() => {
  loadAll.mockReset();
});

describe("runStatus", () => {
  it("delivers the status report as a notification outside the TUI", async () => {
    const { ctx, notify } = context();

    loadAll.mockResolvedValue(loaded([]));

    await runStatus(ctx, pi("medium", []) as never, new ActivePresetSession());

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("No preset is active."),
      "info",
    );
  });
});

describe("statusReport", () => {
  it("says no preset is active, with the Config block and the configuration's warnings", async () => {
    const invalidPreset =
      "Skipped preset 1 in /agent/presets-plus/config.json: It needs a name.";

    loadAll.mockResolvedValue(loaded([], [invalidPreset]));

    const report = await statusReport(
      context().ctx,
      pi("medium", []),
      new ActivePresetSession(),
    );

    expect(report.title).toBe("Presets Plus Status");
    expect(report.body.startsWith(`${report.title}\n`)).toBe(true);
    expect(report.body).toContain("No preset is active.");
    expect(report.body).toContain(configLines.join("\n"));
    expect(report.body).toContain(`- ${invalidPreset}`);
    expect(report.severity).toBe("info");
  });

  it("warns when the active preset is no longer loaded", async () => {
    loadAll.mockResolvedValue(loaded([]));

    const report = await statusReport(
      context().ctx,
      pi("high", []),
      restoredSession(),
    );

    expect(report.body).toContain('Active preset "plan" is no longer loaded.');
    expect(report.severity).toBe("warning");
  });

  it("shows the baseline, the preset's values, and the managed current values", async () => {
    loadAll.mockResolvedValue(loaded([preset]));

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
    loadAll.mockResolvedValue(loaded([preset]));

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
    loadAll.mockResolvedValue(loaded([preset]));

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
