/**
 * Covers the startup `--preset` flag: how it resolves a name across
 * scopes, what it warns when the name is unknown, and how it reports a
 * cancelled or refused activation.
 */
import { ActivePresetSession } from "../src/activation/session.js";
import type { LoadedPreset } from "../src/types.js";
import {
  createFakeContext,
  createFakePi,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestActivationMock = vi.hoisted(() => vi.fn());

vi.mock("../src/activation/request.js", () => ({
  requestActivation: requestActivationMock,
}));

const { applyPresetFlag } = await import("../src/flag.js");

const policy = { rules: [], warnings: [] };

function fakeCtx() {
  const notify = vi.fn();

  return { ctx: createFakeContext({ ui: { notify } }), notify };
}

function fakePi(value: string | undefined) {
  return createFakePi({ getFlag: () => value }).pi;
}

function preset(
  name: string,
  scope: LoadedPreset["scope"],
  options: {
    shadowed?: boolean;
    unavailable?: LoadedPreset["unavailable"];
  } = {},
): LoadedPreset {
  return {
    ...(options.shadowed ? { shadowed: true as const } : {}),
    ...(options.unavailable ? { unavailable: options.unavailable } : {}),
    model: `${scope}-model`,
    name,
    provider: "anthropic",
    scope,
  };
}

beforeEach(() => {
  requestActivationMock.mockReset();
  requestActivationMock.mockResolvedValue({ ok: true });
});

describe("applyPresetFlag", () => {
  it("prefers project presets over shadowed user presets", async () => {
    const { ctx } = fakeCtx();
    const pi = fakePi("plan");
    const userPreset = preset("plan", "user", { shadowed: true });
    const projectPreset = preset("plan", "project");

    const session = new ActivePresetSession();

    await applyPresetFlag(
      pi,
      ctx,
      { policy, presets: [userPreset, projectPreset] },
      session,
    );

    expect(requestActivationMock).toHaveBeenCalledWith(
      projectPreset,
      policy,
      ctx,
      pi,
      session,
    );
  });

  it("deduplicates available names in unknown-name warnings", async () => {
    const { ctx, notify } = fakeCtx();

    await applyPresetFlag(
      fakePi("bad"),
      ctx,
      {
        policy,
        presets: [
          preset("plan", "user", { shadowed: true }),
          preset("plan", "project"),
          preset("review", "user"),
        ],
      },
      new ActivePresetSession(),
    );

    expect(notify).toHaveBeenCalledWith(
      'Presets Plus: 1 warning\n- Unknown preset "bad" for --preset. Available: plan, review.',
      "warning",
    );
  });

  it("marks unavailable entries in unknown-name warnings", async () => {
    const { ctx, notify } = fakeCtx();

    await applyPresetFlag(
      fakePi("bad"),
      ctx,
      {
        policy,
        presets: [preset("plan", "project", { unavailable: "no-key" })],
      },
      new ActivePresetSession(),
    );

    expect(notify).toHaveBeenCalledWith(
      'Presets Plus: 1 warning\n- Unknown preset "bad" for --preset. Available: plan (Unavailable: no-key).',
      "warning",
    );
  });

  it("returns false when activation is cancelled", async () => {
    const { ctx } = fakeCtx();
    const pi = fakePi("plan");
    const selected = preset("plan", "project");

    requestActivationMock.mockResolvedValueOnce({
      kind: "cancelled",
      ok: false,
      reason: "Activation cancelled.",
    });

    await expect(
      applyPresetFlag(
        pi,
        ctx,
        { policy, presets: [selected] },
        new ActivePresetSession(),
      ),
    ).resolves.toBe(false);

    expect(requestActivationMock).toHaveBeenCalledWith(
      selected,
      policy,
      ctx,
      pi,
      expect.any(ActivePresetSession),
    );
  });

  it("notifies once when activation refuses a preset", async () => {
    const { ctx, notify } = fakeCtx();
    const pi = fakePi("plan");
    const selected = preset("plan", "project", { unavailable: "no-key" });

    requestActivationMock.mockResolvedValueOnce({
      kind: "no-key",
      ok: false,
      reason:
        'Preset "plan" is unavailable: missing API key. Activation skipped.',
    });

    const session = new ActivePresetSession();

    await applyPresetFlag(pi, ctx, { policy, presets: [selected] }, session);

    expect(requestActivationMock).toHaveBeenCalledWith(
      selected,
      policy,
      ctx,
      pi,
      session,
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'Preset "plan" is unavailable: missing API key. Activation skipped.',
      "error",
    );
  });
});
