/**
 * Activates the preset that the access policy names as the default for the
 * current directory when nothing else claimed the fresh session.
 */
import { loadPolicy, resolvePolicyDefault } from "../store/policy.js";
import type { LoadedPreset } from "../types.js";
import { notifyApplyResult } from "../ui/apply-result.js";
import { reportWarnings } from "../warnings.js";
import { apply } from "./apply.js";
import type { ActivePresetSession } from "./session.js";
import {
  isAutomaticDefaultEligible,
  type StartupSelection,
} from "./startup-selection.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Whether a command flag or a restored session already chose a preset. */
export interface PolicyDefaultPrecedence {
  readonly flagApplied: boolean;
  readonly restored: boolean;
}

/**
 * Apply a permitted policy default only when startup eligibility allows it.
 *
 * Warnings go into `warnings` when the caller collects them, and otherwise
 * out as one warning notification per step.
 */
export async function maybeApplyPolicyDefault(
  presets: readonly LoadedPreset[],
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
  precedence: PolicyDefaultPrecedence,
  startup: StartupSelection,
  warnings?: string[],
): Promise<boolean> {
  if (precedence.flagApplied || precedence.restored) return false;

  const { rules, warnings: policyWarnings } = await loadPolicy(ctx);

  reportWarnings(ctx, policyWarnings, warnings);

  if (!isAutomaticDefaultEligible(startup, ctx)) return false;

  const resolved = resolvePolicyDefault(ctx.cwd, presets, rules);

  if (resolved.kind === "none") return false;

  if (resolved.kind === "unresolvable") {
    reportWarnings(
      ctx,
      [
        `The default from rule ${resolved.winner.rule.index + 1} (${JSON.stringify(resolved.winner.rule.match)}) does not match any permitted preset that is available. Kept the baseline.`,
      ],
      warnings,
    );

    return false;
  }

  const [preset] = resolved.candidates;
  const result = await apply(preset, ctx, pi, session);

  if (!result.ok) {
    reportWarnings(ctx, [result.reason], warnings);

    return false;
  }

  notifyApplyResult(ctx, preset, result, { unprompted: true, warnings });

  return true;
}
