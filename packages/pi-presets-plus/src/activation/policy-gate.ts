/**
 * Checks a preset against the access policy before activation and asks the
 * user to confirm an override when the policy forbids it.
 */
import {
  isPermitted,
  loadPolicy,
  resolveMatchingRules,
} from "../store/policy.js";
import type { LoadedPreset } from "../types.js";
import { reportWarnings } from "../warnings.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Return true when activation may proceed, including an explicit override.
 *
 * Policy warnings go into `warnings` when the caller collects them, and
 * otherwise out as one warning notification.
 */
export async function gateActivation(
  preset: LoadedPreset,
  ctx: Pick<ExtensionContext, "cwd" | "mode" | "ui">,
  warnings?: string[],
): Promise<boolean> {
  const { rules, warnings: policyWarnings } = await loadPolicy();

  reportWarnings(ctx, policyWarnings, warnings);

  const matchedRules = resolveMatchingRules(ctx.cwd, rules);

  if (isPermitted(preset, matchedRules)) return true;

  const { openPolicyOverride } = await import("../ui/policy-overlay.js");

  return openPolicyOverride(ctx, preset);
}
