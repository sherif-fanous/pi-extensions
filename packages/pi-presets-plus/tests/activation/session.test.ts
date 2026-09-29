/**
 * Covers the active-preset session through its interface: the entries and
 * badge it keeps, how it reattaches a preset from a session branch, how
 * its assessment compares Pi's values with what the preset declared and
 * wrote, and that deleting the active preset leaves it attached. Drives a
 * fake Pi and changes its values the way a user would.
 */
import { join } from "node:path";

import { apply } from "../../src/activation/apply.js";
import { clear } from "../../src/activation/clear.js";
import { statusReport } from "../../src/commands/presets/status.js";
import { loadPresetsConfig, removePreset } from "../../src/store/api.js";
import type { LoadedPreset } from "../../src/types.js";
import {
  makePiHarness,
  reattach,
  type PiHarness,
} from "../helpers/pi-state.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

const plan: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

/** The `presets-plus:active` entries the session appended. */
function activeEntries(harness: PiHarness): unknown[] {
  return harness.entries
    .filter((entry) => entry.customType === "presets-plus:active")
    .map((entry) => entry.data);
}

/** Apply `preset` through the harness. */
async function applyPreset(
  harness: PiHarness,
  preset: LoadedPreset,
): Promise<void> {
  await apply(preset, harness.ctx, harness.pi, harness.session);
}

/** The session's assessment of Pi now. */
function assess(harness: PiHarness) {
  return harness.session.assess(harness.ctx, harness.pi);
}

/** A session branch whose last active-preset entry carries `data`. */
function branchWith(
  data: unknown,
): ReturnType<ExtensionContext["sessionManager"]["getBranch"]> {
  return [
    { customType: "presets-plus:active", data, type: "custom" },
  ] as ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
}

describe("session entries and badge", () => {
  it("records the applied preset, then the clear marker", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);

    expect(harness.status["presets-plus"]).toBe("Preset: plan");

    await harness.session.clear({}, harness.ctx, harness.pi);

    expect(harness.session.current()).toBeUndefined();
    expect(activeEntries(harness)).toEqual([
      { version: 1, name: "plan", scope: "project" },
      { version: 1, name: null },
    ]);
    expect(harness.status["presets-plus"]).toBe("Preset: none");
  });

  it("records a rename and shows the new name", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);
    harness.session.updateIdentity("draft", "user", harness.ctx, harness.pi);

    expect(activeEntries(harness).at(-1)).toEqual({
      version: 1,
      name: "draft",
      scope: "user",
    });
    expect(harness.status["presets-plus"]).toBe("Preset: draft");
  });

  it("clears the footer when inactive status is disabled", async () => {
    const harness = makePiHarness();

    harness.session.setShowInactiveStatus(false, harness.ctx);

    expect(harness.status["presets-plus"]).toBeUndefined();

    await applyPreset(harness, plan);

    expect(harness.status["presets-plus"]).toBe("Preset: plan");

    await harness.session.clear({}, harness.ctx, harness.pi);

    expect(harness.status["presets-plus"]).toBeUndefined();
  });

  it("shows the dirty marker until the preset is marked clean", async () => {
    const harness = makePiHarness();

    harness.session.markDirty(harness.ctx);
    harness.session.markClean(harness.ctx);

    expect(harness.session.current()).toBeUndefined();

    await applyPreset(harness, plan);
    harness.session.markDirty(harness.ctx);

    expect(harness.status["presets-plus"]).toBe("Preset: plan!");

    harness.session.markClean(harness.ctx);

    expect(harness.status["presets-plus"]).toBe("Preset: plan");
  });
});

describe("restoreFromBranch", () => {
  it.each([
    ["without a version", { name: "plan", scope: "project" }],
    ["at version 1", { version: 1, name: "plan", scope: "project" }],
  ])("reattaches the preset an entry %s names", (_label, data) => {
    const harness = makePiHarness();

    const result = harness.session.restoreFromBranch(
      branchWith(data),
      [plan],
      harness.ctx,
    );

    expect(result.warnings).toEqual([]);
    expect(result.state).toMatchObject({ dirty: false, name: "plan" });
    expect(harness.session.current()).toEqual(result.state);
    expect(harness.status["presets-plus"]).toBe("Preset: plan");
  });

  it("does not read an entry with another version", () => {
    const harness = makePiHarness();

    const result = harness.session.restoreFromBranch(
      branchWith({ version: 2, name: "plan", scope: "project" }),
      [plan],
      harness.ctx,
    );

    expect(result).toEqual({ state: undefined, warnings: [] });
    expect(harness.session.current()).toBeUndefined();
  });

  it("does not reattach after a clear marker", () => {
    const harness = makePiHarness();

    const result = harness.session.restoreFromBranch(
      branchWith({ version: 1, name: null }),
      [plan],
      harness.ctx,
    );

    expect(result).toEqual({ state: undefined, warnings: [] });
  });

  it("shows none when the branch has no entry", () => {
    const harness = makePiHarness();

    harness.session.restoreFromBranch([], [plan], harness.ctx);

    expect(harness.status["presets-plus"]).toBe("Preset: none");
  });

  it("warns and shows none when the preset is not loaded", () => {
    const harness = makePiHarness();

    const result = harness.session.restoreFromBranch(
      branchWith({ name: "missing", scope: "project" }),
      [plan],
      harness.ctx,
    );

    expect(result).toEqual({
      state: undefined,
      warnings: [
        'The restored session references preset "missing", which is not loaded. Did not attach it.',
      ],
    });
    expect(harness.status["presets-plus"]).toBe("Preset: none");
  });

  it("clears a disabled footer when the preset is not loaded", () => {
    const harness = makePiHarness();

    harness.session.setShowInactiveStatus(false, harness.ctx);
    harness.session.restoreFromBranch(
      branchWith({ name: "missing", scope: "project" }),
      [plan],
      harness.ctx,
    );

    expect(harness.status["presets-plus"]).toBeUndefined();
  });

  it("warns when the preset is unavailable", () => {
    const harness = makePiHarness();

    const result = harness.session.restoreFromBranch(
      branchWith({ name: "plan", scope: "project" }),
      [{ ...plan, unavailable: "no-key" }],
      harness.ctx,
    );

    expect(result).toEqual({
      state: undefined,
      warnings: [
        'The restored session references preset "plan", which is unavailable (no-key). Did not attach it.',
      ],
    });
  });
});

describe("assess", () => {
  it("returns nothing when no preset is attached", () => {
    expect(assess(makePiHarness())).toBeUndefined();
  });

  it("finds no drift right after an apply, with every field managed", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, { ...plan, tools: ["read"] });

    expect(assess(harness)).toMatchObject({
      current: {
        model: { id: "claude", provider: "anthropic" },
        thinkingLevel: "high",
        tools: ["read"],
      },
      driftReasons: [],
      overlay: {
        model: "matches-last-applied",
        thinking: "matches-last-applied",
        tools: "matches-last-applied",
      },
    });
  });

  it("names the model when the user switches it, and tells a return to the baseline from an override", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);
    harness.selectModel("openai", "gpt");

    expect(assess(harness)).toMatchObject({
      driftReasons: ["model"],
      overlay: { model: "user-override" },
    });

    harness.selectModel("anthropic", "old");

    expect(assess(harness)).toMatchObject({
      driftReasons: ["model"],
      overlay: { model: "already-baseline" },
    });
  });

  it("compares the thinking level with the clamped level it wrote", async () => {
    const harness = makePiHarness({ reasoning: false });

    await applyPreset(harness, plan);

    expect(assess(harness)).toMatchObject({
      driftReasons: [],
      overlay: {
        thinking: "matches-last-applied",
        written: { thinkingLevel: "off" },
      },
    });

    harness.pi.setThinkingLevel("low");

    expect(assess(harness)).toMatchObject({
      driftReasons: ["thinking level"],
      overlay: { thinking: "user-override" },
    });
  });

  it("leaves tools out when no preset in the overlay wrote them", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);
    harness.pi.setActiveTools(["bash", "read"]);

    expect(assess(harness)).toMatchObject({
      driftReasons: [],
      overlay: { tools: "not-owned" },
    });
  });

  it.each([
    [
      "the same tools in another order",
      ["bash", "read"],
      [],
      "matches-last-applied",
    ],
    ["a different tool", ["read"], ["tools"], "user-override"],
    [
      "a repeated tool hiding a missing one",
      ["read", "read"],
      ["tools"],
      "user-override",
    ],
  ] as const)(
    "compares tools as a set: %s",
    async (_label, tools, driftReasons, classification) => {
      const harness = makePiHarness();

      await applyPreset(harness, { ...plan, tools: ["read", "bash"] });
      harness.pi.setActiveTools([...tools]);

      expect(assess(harness)).toMatchObject({
        driftReasons,
        overlay: { tools: classification },
      });
    },
  );

  it("holds Pi to no tools when a preset names only tools Pi lacks", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, { ...plan, tools: ["web"] });

    expect(assess(harness)?.driftReasons).toEqual([]);

    harness.pi.setActiveTools(["read"]);

    expect(assess(harness)).toMatchObject({
      driftReasons: ["tools"],
      overlay: { tools: "user-override" },
    });
  });

  it("holds a later preset to the tools an earlier one wrote", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, { ...plan, tools: ["read"] });
    await applyPreset(harness, { ...plan, model: "opus", name: "write" });
    harness.pi.setActiveTools(["bash"]);

    expect(assess(harness)).toMatchObject({
      driftReasons: ["tools"],
      overlay: {
        baseline: { tools: ["bash"] },
        tools: "already-baseline",
        written: { model: { id: "opus" }, tools: ["read"] },
      },
    });
  });

  it("compares a reattached preset with what it declares, clamped by the registry", () => {
    const harness = makePiHarness({ reasoning: false });

    reattach(harness, { ...plan, tools: ["read"] });
    harness.selectModel("anthropic", "claude");
    harness.pi.setThinkingLevel("off");
    harness.pi.setActiveTools(["read"]);

    const assessment = assess(harness);

    expect(assessment?.driftReasons).toEqual([]);
    expect(assessment?.overlay).toBeUndefined();

    harness.pi.setActiveTools(["bash"]);

    expect(assess(harness)?.driftReasons).toEqual(["tools"]);
  });

  it("keeps its own copy of the tools a preset declares", () => {
    const harness = makePiHarness();
    const tools = ["read"];

    reattach(harness, { ...plan, tools });
    tools.push("bash");

    expect(harness.session.current()?.declared.tools).toEqual(["read"]);
  });
});

describe("isApplied", () => {
  it("holds for the attached preset while Pi keeps its values", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);

    expect(harness.session.isApplied(plan, harness.ctx, harness.pi)).toBe(true);
    expect(
      harness.session.isApplied(
        { ...plan, name: "other" },
        harness.ctx,
        harness.pi,
      ),
    ).toBe(false);

    harness.pi.setThinkingLevel("low");

    expect(harness.session.isApplied(plan, harness.ctx, harness.pi)).toBe(
      false,
    );
  });

  it("does not hold once the preset is edited, even if Pi still matches", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);
    harness.pi.setThinkingLevel("low");

    expect(
      harness.session.isApplied(
        { ...plan, thinkingLevel: "low" },
        harness.ctx,
        harness.pi,
      ),
    ).toBe(false);
  });

  it("applies a later preset again once the user changes the tools it carried", async () => {
    const harness = makePiHarness();
    const write: LoadedPreset = { ...plan, model: "opus", name: "write" };

    await applyPreset(harness, { ...plan, tools: ["read"] });
    await applyPreset(harness, write);
    harness.pi.setActiveTools(["bash"]);

    expect(harness.session.isApplied(write, harness.ctx, harness.pi)).toBe(
      false,
    );

    const result = await apply(write, harness.ctx, harness.pi, harness.session);

    expect(result).toMatchObject({ applied: true, ok: true });
    expect(harness.pi.getActiveTools()).toEqual(["bash"]);
    expect(assess(harness)?.driftReasons).toEqual(["tools"]);
  });

  it("holds for a preset naming a tool Pi lacks, so activating it again writes nothing", async () => {
    const harness = makePiHarness();
    const preset: LoadedPreset = { ...plan, tools: ["read", "web"] };

    await applyPreset(harness, preset);

    expect(harness.session.isApplied(preset, harness.ctx, harness.pi)).toBe(
      true,
    );

    expect(
      await apply(preset, harness.ctx, harness.pi, harness.session),
    ).toEqual({ applied: false, notices: [], ok: true });
  });

  it("never holds for a reattached preset, which has no baseline", () => {
    const harness = makePiHarness();

    reattach(harness, plan);
    harness.selectModel("anthropic", "claude");
    harness.pi.setThinkingLevel("high");

    expect(harness.session.isApplied(plan, harness.ctx, harness.pi)).toBe(
      false,
    );
  });
});

describe("deleting the active preset", () => {
  it("keeps the preset attached, so the badge still names it and clear restores the baseline", async () => {
    const dirs: TempConfigDirs = await createTempConfigDirs();

    try {
      await dirs.writeJson(join(dirs.agentDir, "presets-plus", "config.json"), {
        version: 2,
        presets: [{ model: "claude", name: "plan", provider: "anthropic" }],
      });

      const harness = makePiHarness({ cwd: dirs.cwd });
      const [loaded] = (await loadPresetsConfig(harness.ctx)).presets;

      if (!loaded) throw new Error("Expected preset plan on disk.");

      await applyPreset(harness, loaded);

      expect(await removePreset("plan", "user", harness.ctx)).toEqual({
        ok: true,
      });
      expect(harness.status["presets-plus"]).toBe("Preset: plan");

      const status = await statusReport(
        harness.ctx,
        harness.pi,
        harness.session,
      );

      expect(status.body).toContain(
        'Active preset "plan" is no longer loaded.',
      );

      const report = await clear(harness.ctx, harness.pi, harness.session);

      expect(report?.body).toContain("Model:          anthropic/old");
      expect(harness.ctx.model).toMatchObject({
        id: "old",
        provider: "anthropic",
      });
      expect(harness.pi.getThinkingLevel()).toBe("medium");
      expect(harness.status["presets-plus"]).toBe("Preset: none");
    } finally {
      await dirs.cleanup();
    }
  });
});
