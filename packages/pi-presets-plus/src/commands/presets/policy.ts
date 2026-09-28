/**
 * Reports which presets the policy allows, prohibits, and defaults to for
 * the current directory, and delivers that report to the user.
 */
import { loadAll } from "../../store/api.js";
import {
  isPermitted,
  loadPolicy,
  resolvePolicyDefault,
  type CompiledPolicyRule,
} from "../../store/policy.js";
import type { LoadedPreset } from "../../types.js";
import {
  appendReportWarnings,
  deliverCommandReport,
} from "../../ui/command-report.js";
import {
  ALLOWED_PRESETS_LABEL,
  DEFAULT_MATCHES_LABEL,
  DEFAULT_PRESET_LABEL,
  DIRECTORY_LABEL,
  POLICY_DIALOG_TITLE,
  PROHIBITED_PRESETS_LABEL,
} from "../../ui/labels.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { alignLabelRows } from "@sherif-fanous/pi-extensions-core";

/**
 * Format the effective policy for a cwd as a plain report body, without
 * performing I/O.
 */
export function formatPolicy(
  cwd: string,
  presets: readonly LoadedPreset[],
  rules: readonly CompiledPolicyRule[],
): string {
  const resolvedDefault = resolvePolicyDefault(cwd, presets, rules);
  const { matchedRules } = resolvedDefault;

  if (matchedRules.length === 0) {
    return `${POLICY_DIALOG_TITLE}\n  No preset policy applies to ${cwd}.`;
  }

  const usablePresets = presets.filter(
    (preset) => !preset.shadowed && !preset.unavailable,
  );
  const allowed: string[] = [];
  const prohibited: string[] = [];

  for (const preset of usablePresets) {
    (isPermitted(preset, matchedRules) ? allowed : prohibited).push(
      preset.name,
    );
  }

  const defaultNames =
    resolvedDefault.kind === "resolved"
      ? resolvedDefault.candidates.map(({ name }) => name)
      : [];
  const rows: [label: string, value: string][] = [
    [`${DIRECTORY_LABEL}:`, cwd],
    [`${ALLOWED_PRESETS_LABEL}:`, formatNames(allowed)],
    [`${PROHIBITED_PRESETS_LABEL}:`, formatNames(prohibited)],
    [`${DEFAULT_PRESET_LABEL}:`, defaultNames[0] ?? "none"],
  ];

  if (defaultNames.length > 1) {
    rows.push([`${DEFAULT_MATCHES_LABEL}:`, formatNames(defaultNames)]);
  }

  return [POLICY_DIALOG_TITLE, ...alignLabelRows(rows)].join("\n");
}

/** Load the current effective policy and deliver it as one command report. */
export async function runPolicy(
  ctx: ExtensionCommandContext,
  pi: Pick<ExtensionAPI, "appendEntry">,
): Promise<void> {
  const [policy, loaded] = await Promise.all([loadPolicy(), loadAll(ctx)]);
  const warnings = [...policy.warnings, ...loaded.warnings];
  const body = appendReportWarnings(
    formatPolicy(ctx.cwd, loaded.presets, policy.rules),
    warnings,
  );

  deliverCommandReport(ctx, pi, {
    body,
    severity: warnings.length > 0 ? "warning" : "info",
  });
}

function formatNames(names: readonly string[]): string {
  return names.length > 0 ? names.join(", ") : "none";
}
