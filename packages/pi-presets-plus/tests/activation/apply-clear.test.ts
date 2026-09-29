/**
 * Covers applying and clearing a preset: baseline capture, model,
 * thinking, and tool overlays, refusals for unavailable presets, and the
 * restoration each clear performs, read back through the session's
 * assessment. A fake Pi stands in so the tests never touch a real session.
 */
import { apply } from "../../src/activation/apply.js";
import { clear } from "../../src/activation/clear.js";
import type { LoadedPreset } from "../../src/types.js";
import {
  makePiHarness,
  reattach,
  type PiHarness,
} from "../helpers/pi-state.js";
import { describe, expect, it } from "vitest";

const basePreset: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

/** The overlay part of the session's assessment of Pi now. */
function overlay(harness: PiHarness) {
  return harness.session.assess(harness.ctx, harness.pi)?.overlay;
}

describe("apply", () => {
  it("first activation captures a baseline and applies model/thinking", async () => {
    const harness = makePiHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual(["anthropic/claude"]);
    expect(harness.setToolsCalls).toEqual([]);
    expect(harness.session.current()).toMatchObject({
      dirty: false,
      name: "plan",
      scope: "project",
    });

    expect(overlay(harness)).toEqual({
      baseline: {
        model: { id: "old", provider: "anthropic" },
        thinkingLevel: "medium",
        tools: ["bash"],
      },
      model: "matches-last-applied",
      thinking: "matches-last-applied",
      tools: "not-owned",
      written: {
        model: { id: "claude", provider: "anthropic" },
        thinkingLevel: "high",
      },
    });

    expect(
      await apply(basePreset, harness.ctx, harness.pi, harness.session),
    ).toMatchObject({
      applied: false,
      ok: true,
    });
  });

  it("applies normalized tools from a loaded preset", async () => {
    const loaded: LoadedPreset = {
      ...basePreset,
      tools: ["read", "bash"],
    };
    const harness = makePiHarness();

    await apply(loaded, harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls).toEqual([["read", "bash"]]);
    expect(overlay(harness)).toMatchObject({
      tools: "matches-last-applied",
      written: { tools: ["read", "bash"] },
    });
  });

  it("applies tools after filtering unknown names with a warning", async () => {
    const harness = makePiHarness();

    const result = await apply(
      { ...basePreset, tools: ["read", "missing"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.setToolsCalls).toEqual([["read"]]);
    expect(result).toMatchObject({
      ok: true,
      notices: [
        {
          message: 'Ignored unknown tools for preset "plan": missing.',
          severity: "warning",
        },
      ],
    });
    expect(harness.notificationCalls).toEqual([]);

    expect(overlay(harness)).toMatchObject({
      tools: "matches-last-applied",
      written: { tools: ["read"] },
    });
  });

  it("returns all apply accompaniments without notifying", async () => {
    const harness = makePiHarness({ reasoning: false, allTools: ["read"] });
    const result = await apply(
      { ...basePreset, tools: ["read", "missing"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toMatchObject({
      ok: true,
      notices: [
        {
          severity: "info",
          message: 'Thinking level changed from high to off for preset "plan".',
        },
        {
          severity: "warning",
          message: 'Ignored unknown tools for preset "plan": missing.',
        },
      ],
    });
    expect(harness.notificationCalls).toEqual([]);
  });

  it("preserves baseline and sticky tools across preset switches", async () => {
    const harness = makePiHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    await apply(
      { ...basePreset, model: "opus", name: "write" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toMatchObject({ name: "write" });
    expect(overlay(harness)).toMatchObject({
      baseline: {
        model: { id: "old", provider: "anthropic" },
        thinkingLevel: "medium",
        tools: ["bash"],
      },
      tools: "matches-last-applied",
      written: {
        model: { id: "opus", provider: "anthropic" },
        tools: ["read"],
      },
    });
  });

  it("captures a fresh baseline after priorUnknown", async () => {
    const harness = makePiHarness();

    reattach(harness, basePreset);
    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(overlay(harness)).toMatchObject({
      baseline: { model: { id: "old", provider: "anthropic" } },
    });
  });

  it("refuses unavailable presets before changing state", async () => {
    const harness = makePiHarness();

    const result = await apply(
      { ...basePreset, unavailable: "no-key" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toEqual({
      kind: "no-key",
      ok: false,
      reason:
        'Preset "plan" is unavailable because its provider has no API key. Pi did not activate it.',
    });
    expect(harness.notifications).toEqual([]);
    expect(harness.setModelCalls).toEqual([]);
    expect(harness.session.current()).toBeUndefined();
  });

  it("returns no-model refusals without notifying", async () => {
    const harness = makePiHarness();

    const result = await apply(
      { ...basePreset, unavailable: "no-model" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toMatchObject({ kind: "no-model", ok: false });
    expect(harness.notifications).toEqual([]);
  });

  it("returns unknown-model refusals without notifying", async () => {
    const harness = makePiHarness();

    const result = await apply(
      { ...basePreset, model: "missing" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toEqual({
      kind: "unknown-model",
      ok: false,
      reason: 'Preset "plan" references unknown model anthropic/missing.',
    });
    expect(harness.notifications).toEqual([]);
  });

  it("returns key-revoked refusals without notifying", async () => {
    const harness = makePiHarness({ failModel: "claude" });

    const result = await apply(
      basePreset,
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toEqual({
      kind: "key-revoked",
      ok: false,
      reason: "Pi has no API key configured for anthropic/claude.",
    });
    expect(harness.notifications).toEqual([]);
    expect(harness.session.current()).toBeUndefined();
  });

  it("clears stale dirty state on the idempotent re-apply fast path", async () => {
    const harness = makePiHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    harness.session.markDirty(harness.ctx);

    harness.setModelCalls.length = 0;
    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual([]);
    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("re-applies the same preset when state drifted while preserving baseline", async () => {
    const harness = makePiHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);
    harness.selectModel("openai", "gpt");
    harness.setModelCalls.length = 0;
    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual(["anthropic/claude"]);
    expect(overlay(harness)).toMatchObject({
      baseline: { model: { id: "old", provider: "anthropic" } },
    });
  });

  it("notifies when thinking is clamped", async () => {
    const harness = makePiHarness({ reasoning: false });

    const result = await apply(
      basePreset,
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("off");
    expect(result).toMatchObject({
      notices: [
        {
          message: 'Thinking level changed from high to off for preset "plan".',
          severity: "info",
        },
      ],
    });
    expect(harness.notifications).toEqual([]);
  });

  it("clamps when thinkingLevelMap explicitly nulls the requested level", async () => {
    const harness = makePiHarness({ thinkingLevelMap: { low: null } });

    const result = await apply(
      { ...basePreset, thinkingLevel: "low" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("off");
    expect(result).toMatchObject({
      notices: [
        {
          message: 'Thinking level changed from low to off for preset "plan".',
          severity: "info",
        },
      ],
    });
    expect(harness.notifications).toEqual([]);
  });

  it("honors requested levels through high when missing from thinkingLevelMap", async () => {
    const harness = makePiHarness({ thinkingLevelMap: { xhigh: "max" } });

    await apply(
      { ...basePreset, thinkingLevel: "low" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("low");
    expect(harness.notifications.join("\n")).not.toContain(
      "requested thinking:low",
    );
  });

  it("clamps xhigh unless thinkingLevelMap explicitly maps it", async () => {
    const harness = makePiHarness();

    const result = await apply(
      { ...basePreset, thinkingLevel: "xhigh" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("off");
    expect(result).toMatchObject({
      notices: [
        {
          message:
            'Thinking level changed from xhigh to off for preset "plan".',
          severity: "info",
        },
      ],
    });
    expect(harness.notifications).toEqual([]);
  });

  it("applies max when thinkingLevelMap explicitly maps it", async () => {
    const harness = makePiHarness({ thinkingLevelMap: { max: "max" } });

    const result = await apply(
      { ...basePreset, thinkingLevel: "max" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("max");
    expect(result).toMatchObject({ notices: [] });
  });

  it("tracks Pi's fallback when both max and off are unavailable", async () => {
    const harness = makePiHarness({
      thinkingLevelMap: { max: null, off: null },
    });

    const result = await apply(
      { ...basePreset, thinkingLevel: "max" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("minimal");
    expect(overlay(harness)).toMatchObject({
      written: { thinkingLevel: "minimal" },
    });

    expect(result).toMatchObject({
      notices: [
        {
          message:
            'Thinking level changed from max to minimal for preset "plan".',
          severity: "info",
        },
      ],
    });

    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.pi.getThinkingLevel()).toBe("medium");
  });

  it("clamps max unless thinkingLevelMap explicitly maps it", async () => {
    const harness = makePiHarness();

    const result = await apply(
      { ...basePreset, thinkingLevel: "max" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("off");
    expect(result).toMatchObject({
      notices: [
        {
          message: 'Thinking level changed from max to off for preset "plan".',
          severity: "info",
        },
      ],
    });
  });
});

describe("clear", () => {
  it("restores baseline fields after a single activation", async () => {
    const harness = makePiHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls.at(-1)).toBe("anthropic/old");
    expect(harness.pi.getThinkingLevel()).toBe("medium");
    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
    expect(harness.session.current()).toBeUndefined();
    expect(report?.body).toContain("Presets Plus Cleared");
    expect(report?.body).toContain("Preset:         plan");
    expect(report?.body).toContain("Pi restored your previous settings.");

    expect(report?.body).toContain("Model:          anthropic/old");

    expect(report?.body).toContain("Thinking level: medium");

    expect(report?.body).toContain("Tools:          bash");
    expect(report?.severity).toBe("info");
  });

  it("restores to pre-chain baseline for sequential applies", async () => {
    const harness = makePiHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    await apply(
      { ...basePreset, model: "opus", name: "write", tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls.at(-1)).toBe("anthropic/old");
    expect(harness.pi.getThinkingLevel()).toBe("medium");
    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
  });

  it("leaves tools unchanged when the overlay never owned tools", async () => {
    const harness = makePiHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);
    harness.pi.setActiveTools(["read"]);

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls).toEqual([["read"]]);
    expect(report?.body).toContain(
      "Tools:          read (Not managed by cleared preset)",
    );
  });

  it("respects a user model override while restoring other fields", async () => {
    const harness = makePiHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    harness.selectModel("openai", "gpt");

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual(["anthropic/claude"]);
    expect(harness.pi.getThinkingLevel()).toBe("medium");
    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
    expect(report?.body).toContain(
      "Model:          openai/gpt (Left as-is because you changed it after activation)",
    );
  });

  it("preserves a thinking override when restoring the model resets it", async () => {
    const harness = makePiHarness({ thinkingAfterModelSet: "medium" });

    await apply(
      { ...basePreset, thinkingLevel: "low" },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    harness.pi.setThinkingLevel("high");

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls.at(-1)).toBe("anthropic/old");
    expect(harness.pi.getThinkingLevel()).toBe("high");
    expect(report?.body).toContain(
      "Thinking level: high (Left as-is because you changed it after activation)",
    );
  });

  it("respects a user tools override", async () => {
    const harness = makePiHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    harness.pi.setActiveTools(["bash", "read"]);

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls).toEqual([["read"], ["bash", "read"]]);
    expect(report?.body).toContain(
      "Tools:          bash, read (Left as-is because you changed it after activation)",
    );
  });

  it("reports model restore failure but still clears active state", async () => {
    const harness = makePiHarness({ failModel: "old" });

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toBeUndefined();
    expect(report?.body).toContain(
      "Model:          Pi could not switch back to anthropic/old.",
    );
    expect(report?.severity).toBe("warning");
    expect(harness.pi.getThinkingLevel()).toBe("medium");
  });

  it("continues restoring fields when model restoration rejects", async () => {
    const harness = makePiHarness({ rejectModel: "old" });

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toBeUndefined();
    expect(harness.pi.getThinkingLevel()).toBe("medium");
    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
    expect(report?.body).toContain(
      "Model:          Pi could not switch back to anthropic/old.",
    );
  });

  it("filters unavailable baseline tools on restore", async () => {
    const harness = makePiHarness({ allTools: ["read"] });

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls.at(-1)).toEqual([]);
    expect(report?.body).toContain("Tools:          none (Unavailable: bash)");
    expect(report?.severity).toBe("warning");
  });

  it("restores tools changed only by the first preset in a chain", async () => {
    const harness = makePiHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    await apply(
      { ...basePreset, model: "opus", name: "write" },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
  });

  it("soft-clears priorUnknown attachments without mutating pi fields", async () => {
    const harness = makePiHarness();

    reattach(harness, basePreset);

    const report = await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual([]);
    expect(harness.setToolsCalls).toEqual([]);
    expect(harness.session.current()).toBeUndefined();
    expect(report?.body).toContain(
      "Model:          anthropic/old (No baseline saved for this field)",
    );
  });

  it("returns no report when no preset is active", async () => {
    const harness = makePiHarness();

    expect(
      await clear(harness.ctx, harness.pi, harness.session),
    ).toBeUndefined();
    expect(harness.notifications).toEqual([]);
  });
});
