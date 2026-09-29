/**
 * Covers the handlers that flip the active preset between clean and dirty
 * on Pi's model, thinking level, and turn events: which events they act
 * on, and that the session's own writes never count as drift.
 */
import { apply } from "../../src/activation/apply.js";
import {
  handleModelSelectDrift,
  handleThinkingLevelSelectDrift,
  syncDirtyFromCurrentState,
} from "../../src/activation/drift-handlers.js";
import type { LoadedPreset } from "../../src/types.js";
import { makePiHarness, type PiHarness } from "../helpers/pi-state.js";
import { describe, expect, it } from "vitest";

const plan: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

const write: LoadedPreset = {
  ...plan,
  model: "opus",
  name: "write",
  thinkingLevel: "low",
};

/** Apply `preset` through the harness. */
async function applyPreset(
  harness: PiHarness,
  preset: LoadedPreset,
): Promise<void> {
  await apply(preset, harness.ctx, harness.pi, harness.session);
}

describe("handleModelSelectDrift", () => {
  it("ignores the model_select the session's own write fires", async () => {
    const dirtyDuringWrite: (boolean | undefined)[] = [];
    const harness: PiHarness = makePiHarness({
      onModelSet() {
        handleModelSelectDrift(
          { model: { id: "opus", provider: "anthropic" }, source: "set" },
          harness.ctx,
          harness.pi,
          harness.session,
        );
        dirtyDuringWrite.push(harness.session.current()?.dirty);
      },
    });

    await applyPreset(harness, plan);
    await applyPreset(harness, write);

    expect(dirtyDuringWrite).toEqual([undefined, false]);
  });

  it("marks dirty when the user picks another model", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);
    harness.selectModel("openai", "gpt");
    handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "cycle" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toMatchObject({ dirty: true });
    expect(harness.status["presets-plus"]).toBe("Preset: plan!");
  });

  it("ignores restore model_select events", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);
    harness.selectModel("openai", "gpt");
    handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "restore" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("no-ops when no preset is active", () => {
    const harness = makePiHarness();

    handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "set" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toBeUndefined();
  });
});

describe("handleThinkingLevelSelectDrift", () => {
  it("ignores the thinking_level_select the session's own write fires", async () => {
    const dirtyDuringWrite: (boolean | undefined)[] = [];
    const harness: PiHarness = makePiHarness({
      onThinkingLevelSet() {
        handleThinkingLevelSelectDrift(
          harness.ctx,
          harness.pi,
          harness.session,
        );
        dirtyDuringWrite.push(harness.session.current()?.dirty);
      },
    });

    await applyPreset(harness, plan);
    await applyPreset(harness, write);

    expect(dirtyDuringWrite).toEqual([undefined, false]);
  });

  it("marks dirty when the user picks another level", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);
    harness.pi.setThinkingLevel("low");
    handleThinkingLevelSelectDrift(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toMatchObject({ dirty: true });
  });
});

describe("syncDirtyFromCurrentState", () => {
  it("marks the preset clean once Pi is back on its values", async () => {
    const harness = makePiHarness();

    await applyPreset(harness, plan);
    harness.pi.setThinkingLevel("low");
    syncDirtyFromCurrentState(harness.ctx, harness.pi, harness.session);
    harness.pi.setThinkingLevel("high");
    syncDirtyFromCurrentState(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toMatchObject({ dirty: false });
    expect(harness.status["presets-plus"]).toBe("Preset: plan");
  });
});
