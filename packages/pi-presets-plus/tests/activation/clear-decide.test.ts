/**
 * Covers the per-field decision table that clear uses to choose what to
 * restore, calling the pure helper on an assessment without driving `pi`
 * or `ctx.ui`.
 */
import { decideClear } from "../../src/activation/clear.js";
import type {
  OverlayAssessment,
  OverlayComparison,
} from "../../src/activation/session.js";
import type { PiState } from "../../src/types.js";
import { describe, expect, it } from "vitest";

const managed: OverlayComparison = {
  baseline: {
    model: { provider: "anthropic", id: "old" },
    thinkingLevel: "medium",
    tools: ["bash"],
  },
  model: "matches-last-applied",
  thinking: "matches-last-applied",
  tools: "matches-last-applied",
  written: {
    model: { provider: "anthropic", id: "claude" },
    thinkingLevel: "high",
    tools: ["read"],
  },
};

/**
 * An assessment of preset `plan` over `managed`, with Pi on the values it
 * wrote unless `current` says otherwise. `overlay: undefined` stands for a
 * preset reattached without a baseline.
 */
function assessment(
  options: {
    readonly current?: Partial<PiState>;
    readonly overlay?: Partial<OverlayComparison> | undefined;
  } = {},
): OverlayAssessment {
  const overlay =
    "overlay" in options && options.overlay === undefined
      ? undefined
      : { ...managed, ...options.overlay };

  return {
    active: {
      declared: { model: "claude", provider: "anthropic" },
      dirty: false,
      name: "plan",
      scope: "project",
    },
    current: {
      model: { provider: "anthropic", id: "claude" },
      thinkingLevel: "high",
      tools: ["read"],
      ...options.current,
    },
    driftReasons: [],
    ...(overlay ? { overlay } : {}),
  };
}

const ALL_TOOLS = ["bash", "read"];

describe("decideClear", () => {
  it("restores baseline for fully extension-owned state", () => {
    const decision = decideClear(assessment(), ALL_TOOLS);

    expect(decision.writes).toEqual({
      model: { provider: "anthropic", id: "old" },
      thinkingLevel: "medium",
      tools: ["bash"],
    });

    expect(decision.parts).toEqual([
      { action: "restored", field: "model", value: "anthropic/old" },
      { action: "restored", field: "thinking", value: "medium" },
      { action: "restored", dropped: undefined, field: "tools", value: "bash" },
    ]);
  });

  it("leaves a user model override alone and reports the current model", () => {
    const decision = decideClear(
      assessment({
        current: { model: { provider: "openai", id: "gpt" } },
        overlay: { model: "user-override" },
      }),
      ALL_TOOLS,
    );

    expect(decision.writes.model).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "model")).toEqual({
      action: "user-override",
      field: "model",
      value: "openai/gpt",
    });
  });

  it("restores a max thinking baseline", () => {
    const decision = decideClear(
      assessment({
        overlay: { baseline: { ...managed.baseline, thinkingLevel: "max" } },
      }),
      ALL_TOOLS,
    );

    expect(decision.writes.thinkingLevel).toBe("max");
  });

  it("leaves a user thinking override alone", () => {
    const decision = decideClear(
      assessment({
        current: { thinkingLevel: "low" },
        overlay: { thinking: "user-override" },
      }),
      ALL_TOOLS,
    );

    expect(decision.writes.thinkingLevel).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "thinking")).toEqual({
      action: "user-override",
      field: "thinking",
      value: "low",
    });
  });

  it("leaves a user tools override alone", () => {
    const decision = decideClear(
      assessment({
        current: { tools: ["bash", "read"] },
        overlay: { tools: "user-override" },
      }),
      ALL_TOOLS,
    );

    expect(decision.writes.tools).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "tools")).toEqual({
      action: "user-override",
      field: "tools",
      value: "bash, read",
    });
  });

  it("marks already-baseline fields without queuing writes", () => {
    const decision = decideClear(
      assessment({
        current: managed.baseline,
        overlay: {
          model: "already-baseline",
          thinking: "already-baseline",
          tools: "already-baseline",
        },
      }),
      ALL_TOOLS,
    );

    expect(decision.writes).toEqual({});
    expect(
      decision.parts.every((part) => part.action === "already-baseline"),
    ).toBe(true);
  });

  it("leaves tools alone when the overlay never owned them", () => {
    const decision = decideClear(
      assessment({
        current: { tools: ["foo"] },
        overlay: { tools: "not-owned" },
      }),
      ALL_TOOLS,
    );

    expect(decision.writes.tools).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "tools")).toEqual({
      action: "not-owned",
      field: "tools",
      value: "foo",
    });
  });

  it("filters unavailable baseline tools and emits restored-partial", () => {
    const decision = decideClear(assessment(), ["read"]);

    expect(decision.writes.tools).toEqual([]);

    const toolsPart = decision.parts.find((part) => part.field === "tools");

    expect(toolsPart?.action).toBe("restored-partial");
    expect(toolsPart?.dropped).toEqual(["bash"]);
  });

  it("returns baseline-null when Pi holds the written model but no baseline model was saved", () => {
    const decision = decideClear(
      assessment({
        overlay: { baseline: { ...managed.baseline, model: null } },
      }),
      ALL_TOOLS,
    );

    expect(decision.writes.model).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "model")).toEqual({
      action: "baseline-null",
      field: "model",
      value: "anthropic/claude",
    });
  });

  it("emits all-unknown parts and no writes without an overlay", () => {
    const decision = decideClear(assessment({ overlay: undefined }), ALL_TOOLS);

    expect(decision.writes).toEqual({});
    expect(decision.parts).toEqual([
      { action: "unknown", field: "model", value: "anthropic/claude" },
      { action: "unknown", field: "thinking", value: "high" },
      { action: "unknown", field: "tools", value: "read" },
    ]);
  });
});
