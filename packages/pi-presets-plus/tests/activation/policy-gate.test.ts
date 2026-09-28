/**
 * Covers the gate that checks a preset against the user access policy
 * before activation, opening the override overlay for prohibited presets
 * and reporting the policy's warnings as a single notification.
 */
import { join } from "node:path";

import { loadPresetsConfig } from "../../src/store/api.js";
import type { LoadedPreset } from "../../src/types.js";
import {
  createFakeContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openPolicyOverrideMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/ui/policy-overlay.js", () => ({
  openPolicyOverride: openPolicyOverrideMock,
}));

const { gateActivation } = await import("../../src/activation/policy-gate.js");

const allowed: LoadedPreset = {
  model: "claude-opus",
  name: "allowed",
  provider: "anthropic",
  scope: "user",
};

let dirs: TempConfigDirs;

function context() {
  const notify = vi.fn();

  return {
    ctx: createFakeContext({ cwd: dirs.cwd, ui: { notify } }),
    notify,
  };
}

/** Write `rules` as the user file's policy and load the configuration. */
async function policyFromFile(rules: readonly unknown[]) {
  await dirs.writeJson(join(dirs.agentDir, "presets-plus", "config.json"), {
    version: 2,
    policy: { rules },
  });

  return (await loadPresetsConfig(context().ctx)).policy;
}

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  openPolicyOverrideMock.mockReset();
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("gateActivation", () => {
  it("passes permitted activations without opening the overlay", async () => {
    const { ctx, notify } = context();
    const policy = await policyFromFile([
      { allow: [{ pattern: "^allowed$" }], match: "project$" },
    ]);

    await expect(gateActivation(allowed, policy, ctx)).resolves.toBe(true);
    expect(openPolicyOverrideMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([
    ["override", true],
    ["cancel", false],
  ])(
    "returns the %s overlay outcome for a prohibited preset",
    async (_label, outcome) => {
      const { ctx } = context();
      const policy = await policyFromFile([
        { match: "project$", prohibit: [{ pattern: "allowed" }] },
      ]);

      openPolicyOverrideMock.mockResolvedValue(outcome);

      await expect(gateActivation(allowed, policy, ctx)).resolves.toBe(outcome);
      expect(openPolicyOverrideMock).toHaveBeenCalledWith(ctx, allowed);
    },
  );

  it("leaves the policy's warnings to the configuration report", async () => {
    const { ctx, notify } = context();
    const policy = await policyFromFile([{ match: "[" }, { match: 1 }]);

    await gateActivation(allowed, policy, ctx);

    expect(notify).not.toHaveBeenCalled();
  });
});
