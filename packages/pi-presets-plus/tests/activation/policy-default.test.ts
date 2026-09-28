/**
 * Covers policy-default startup eligibility, precedence, resolution, and
 * unchanged apply outcomes, reading the policy from a real user file.
 */
import { join } from "node:path";

import { ActivePresetSession } from "../../src/activation/session.js";
import type { StartupSelection } from "../../src/activation/startup-selection.js";
import { loadPresetsConfig } from "../../src/store/api.js";
import type { LoadedPreset } from "../../src/types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakePi,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { applyMock, isAutomaticDefaultEligibleMock } = vi.hoisted(() => ({
  applyMock: vi.fn(),
  isAutomaticDefaultEligibleMock: vi.fn(),
}));

vi.mock("../../src/activation/apply.js", () => ({ apply: applyMock }));
vi.mock("../../src/activation/startup-selection.js", () => ({
  isAutomaticDefaultEligible: isAutomaticDefaultEligibleMock,
}));

const { maybeApplyPolicyDefault } =
  await import("../../src/activation/policy-default.js");

const selected: LoadedPreset = {
  model: "claude-opus",
  name: "work-opus",
  provider: "anthropic",
  scope: "user",
};
const captured: StartupSelection = {
  model: { id: "gpt", provider: "openai" },
  thinkingLevel: "medium",
};

let dirs: TempConfigDirs;

async function applyDefault(
  ctx: ExtensionContext,
  precedence = { flagApplied: false, restored: false },
  startup = captured,
) {
  const { pi } = createFakePi();
  const session = new ActivePresetSession();
  const { policy } = await loadPresetsConfig(ctx);
  const result = await maybeApplyPolicyDefault(
    { policy, presets: [selected] },
    ctx,
    pi,
    session,
    precedence,
    startup,
  );

  return { pi, result, session };
}

function context(mode: ExtensionContext["mode"] = "tui") {
  const notify = vi.fn();

  return {
    ctx: createFakeContext({ cwd: dirs.cwd, mode, ui: { notify } }),
    notify,
  };
}

/**
 * Write a user policy whose one rule matches the test's cwd and defaults
 * to presets named by `pattern`, followed by `extraRules`.
 */
async function writePolicy(
  pattern = "work-opus",
  extraRules: readonly unknown[] = [],
): Promise<void> {
  await dirs.writeJson(join(dirs.agentDir, "presets-plus", "config.json"), {
    version: 2,
    policy: {
      rules: [{ default: { pattern }, match: "project$" }, ...extraRules],
    },
  });
}

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  applyMock.mockReset();
  isAutomaticDefaultEligibleMock.mockReset();
  applyMock.mockResolvedValue({ ok: true });
  isAutomaticDefaultEligibleMock.mockReturnValue(true);
  await writePolicy();
});

afterEach(async () => {
  await dirs.cleanup();
});

describe("maybeApplyPolicyDefault", () => {
  it.each([
    ["flag", { flagApplied: true, restored: false }],
    ["successful restore", { flagApplied: false, restored: true }],
  ])(
    "does nothing when %s preempts the default",
    async (_label, precedence) => {
      const { ctx, notify } = context();
      const { result } = await applyDefault(ctx, precedence);

      expect(result).toBe(false);
      expect(isAutomaticDefaultEligibleMock).not.toHaveBeenCalled();
      expect(applyMock).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it("silently skips when startup comparison is ineligible", async () => {
    const { ctx, notify } = context();

    isAutomaticDefaultEligibleMock.mockReturnValue(false);

    const { result } = await applyDefault(ctx);

    expect(result).toBe(false);
    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not report an unresolvable default when comparison fails", async () => {
    const { ctx, notify } = context();

    await writePolicy("missing");

    isAutomaticDefaultEligibleMock.mockReturnValue(false);

    await applyDefault(ctx);

    expect(notify).not.toHaveBeenCalled();
  });

  it("applies after a failed restore with one success notification", async () => {
    const { ctx, notify } = context();
    const { pi, result, session } = await applyDefault(ctx);

    expect(result).toBe(true);
    expect(applyMock).toHaveBeenCalledWith(selected, ctx, pi, session);
    expect(notify).toHaveBeenCalledWith(
      'Presets Plus applied preset "work-opus".',
      "info",
    );
  });

  it("warns and keeps the baseline when the default is unresolvable", async () => {
    const { ctx, notify } = context();

    await writePolicy("missing");

    await applyDefault(ctx);

    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("does not match any permitted preset"),
      "warning",
    );
  });

  it("treats apply refusal as a non-fatal warning", async () => {
    const { ctx, notify } = context();

    applyMock.mockResolvedValue({
      kind: "key-revoked",
      ok: false,
      reason: "Key was revoked.",
    });

    const { result } = await applyDefault(ctx);

    expect(result).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      "Presets Plus: 1 warning\n- Key was revoked.",
      "warning",
    );
  });
});
