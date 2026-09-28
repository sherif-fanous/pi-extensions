/**
 * Covers the entry point for a user-requested activation, which runs the
 * policy gate first and applies the preset only when the gate permits it.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset } from "../../src/types.js";
import {
  createFakeContext,
  createFakePi,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyMock, gateActivationMock } = vi.hoisted(() => ({
  applyMock: vi.fn(),
  gateActivationMock: vi.fn(),
}));

vi.mock("../../src/activation/apply.js", () => ({ apply: applyMock }));
vi.mock("../../src/activation/policy-gate.js", () => ({
  gateActivation: gateActivationMock,
}));

const { requestActivation } = await import("../../src/activation/request.js");

const preset: LoadedPreset = {
  model: "claude-opus",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};
const policy = { rules: [], warnings: [] };
const ctx = createFakeContext();
const { pi } = createFakePi();

beforeEach(() => {
  applyMock.mockReset();
  gateActivationMock.mockReset();
  gateActivationMock.mockResolvedValue(true);
});

describe("requestActivation", () => {
  it("applies and returns the exact result when policy permits activation", async () => {
    const session = new ActivePresetSession();
    const result = {
      kind: "no-key",
      ok: false,
      reason: "No API key.",
    } as const;

    applyMock.mockResolvedValue(result);

    await expect(
      requestActivation(preset, policy, ctx, pi, session),
    ).resolves.toBe(result);

    expect(gateActivationMock).toHaveBeenCalledWith(preset, policy, ctx);
    expect(applyMock).toHaveBeenCalledWith(preset, ctx, pi, session);
  });

  it("returns cancellation without applying when policy denies activation", async () => {
    gateActivationMock.mockResolvedValue(false);

    await expect(
      requestActivation(preset, policy, ctx, pi, new ActivePresetSession()),
    ).resolves.toEqual({
      kind: "cancelled",
      ok: false,
      reason: "Activation cancelled.",
    });
    expect(applyMock).not.toHaveBeenCalled();
  });
});
