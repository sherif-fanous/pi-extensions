/**
 * Reports which presets the policy allows, prohibits, and defaults to for
 * the current directory, and delivers that report to the user.
 */
import { EXTENSION_NAME } from "../../extension-name.js";
import { loadPresetsConfig } from "../../store/api.js";
import {
  isPermitted,
  resolvePolicyDefault,
  type CompiledPolicyRule,
} from "../../store/policy.js";
import type { LoadedPreset } from "../../types.js";
import { deliverCommandReport } from "../../ui/command-report.js";
import {
  ALLOWED_PRESETS_LABEL,
  DEFAULT_MATCHES_LABEL,
  DEFAULT_PRESET_LABEL,
  DIRECTORY_LABEL,
  PROHIBITED_PRESETS_LABEL,
} from "../../ui/labels.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  formatReport,
  type ReportRow,
} from "@sherif-fanous/pi-extensions-core";

/**
 * Format the effective policy for a cwd as a plain report body ending with
 * `warnings`, without performing I/O.
 */
export function formatPolicy(
  cwd: string,
  presets: readonly LoadedPreset[],
  rules: readonly CompiledPolicyRule[],
  warnings: readonly string[] = [],
): string {
  return formatReport(EXTENSION_NAME, "Policy", {
    rows: policyRows(cwd, presets, rules),
    warnings,
  });
}

/** Load the current effective policy and deliver it as one command report. */
export async function runPolicy(
  ctx: ExtensionCommandContext,
  pi: Pick<ExtensionAPI, "appendEntry">,
): Promise<void> {
  const { config, policy, presets } = await loadPresetsConfig(ctx);
  const warnings = [...policy.warnings, ...config.warnings];

  deliverCommandReport(ctx, pi, {
    body: formatPolicy(ctx.cwd, presets, policy.rules, warnings),
    severity: warnings.length > 0 ? "warning" : "info",
  });
}

function formatNames(names: readonly string[]): string {
  return names.length > 0 ? names.join(", ") : "none";
}

function policyRows(
  cwd: string,
  presets: readonly LoadedPreset[],
  rules: readonly CompiledPolicyRule[],
): ReportRow[] {
  const resolvedDefault = resolvePolicyDefault(cwd, presets, rules);
  const { matchedRules } = resolvedDefault;

  if (matchedRules.length === 0) {
    return [`No preset policy applies to ${cwd}.`];
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
  const rows: ReportRow[] = [
    [`${DIRECTORY_LABEL}:`, cwd],
    [`${ALLOWED_PRESETS_LABEL}:`, formatNames(allowed)],
    [`${PROHIBITED_PRESETS_LABEL}:`, formatNames(prohibited)],
    [`${DEFAULT_PRESET_LABEL}:`, defaultNames[0] ?? "none"],
  ];

  if (defaultNames.length > 1) {
    rows.push([`${DEFAULT_MATCHES_LABEL}:`, formatNames(defaultNames)]);
  }

  return rows;
}
