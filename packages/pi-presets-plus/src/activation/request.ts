/**
 * Runs the access-policy check for a preset the user asked for and applies
 * the preset once it passes.
 */
import type { CompiledPolicy } from "../store/policy.js";
import type { LoadedPreset } from "../types.js";
import { apply, type ApplyResult } from "./apply.js";
import { gateActivation } from "./policy-gate.js";
import type { ActivePresetSession } from "./session.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/**
 * Apply outcome, plus the refusal returned when the user declines the policy
 * override.
 */
export type ActivationResult =
  | ApplyResult
  | {
      readonly kind: "cancelled";
      readonly ok: false;
      readonly reason: string;
    };

/**
 * Check `policy`, then apply a preset when activation is permitted.
 *
 * Policy warnings go into `warnings` when the caller collects them, and
 * otherwise out as one warning notification.
 */
export async function requestActivation(
  preset: LoadedPreset,
  policy: CompiledPolicy,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
  warnings?: string[],
): Promise<ActivationResult> {
  if (!(await gateActivation(preset, policy, ctx, warnings))) {
    return {
      kind: "cancelled",
      ok: false,
      reason: "Activation cancelled.",
    };
  }

  return apply(preset, ctx, pi, session);
}
