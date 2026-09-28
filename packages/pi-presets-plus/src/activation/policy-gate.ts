/**
 * Checks a preset against the access policy before activation and asks the
 * user to confirm an override when the policy forbids it.
 */
import {
  isPermitted,
  resolveMatchingRules,
  type PolicyRules,
} from "../store/policy.js";
import type { LoadedPreset } from "../types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Return true when `policy` permits activation, including an explicit
 * override.
 */
export async function gateActivation(
  preset: LoadedPreset,
  policy: PolicyRules,
  ctx: Pick<ExtensionContext, "cwd" | "mode" | "ui">,
): Promise<boolean> {
  const matchedRules = resolveMatchingRules(ctx.cwd, policy.rules);

  if (isPermitted(preset, matchedRules)) return true;

  const { openPolicyOverride } = await import("../ui/policy-overlay.js");

  return openPolicyOverride(ctx, preset);
}
