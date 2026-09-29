/**
 * Reports `/presets status`: which preset is active, the baseline it
 * overlays, how the session's current model, thinking level, and tools
 * compare against both, and the state of each configuration file.
 */
import type {
  ActivePresetSession,
  OverlayAssessment,
} from "../../activation/session.js";
import { findPreset } from "../../preset-identity.js";
import { loadPresetsConfig } from "../../store/api.js";
import {
  deliverCommandReport,
  presetsReport,
  type PresetsReport,
} from "../../ui/command-report.js";
import {
  BASELINE_MODEL_LABEL,
  BASELINE_THINKING_LABEL,
  BASELINE_TOOLS_LABEL,
  CURRENT_MODEL_LABEL,
  CURRENT_THINKING_LABEL,
  CURRENT_TOOLS_LABEL,
  PRESET_LABEL,
  PRESET_MODEL_LABEL,
  PRESET_THINKING_LABEL,
  PRESET_TOOLS_LABEL,
  RESTORE_LABEL,
  SCOPE_LABEL,
} from "../../ui/labels.js";
import {
  formatModel,
  formatTools,
  OVERLAY_FIELD_WORDING,
} from "../../ui/overlay-wording.js";
import { formatScopeName } from "../../ui/widgets.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { ReportRow } from "@sherif-fanous/pi-extensions-core";

/** Run `/presets status` and deliver the report to the user. */
export async function runStatus(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<void> {
  const report = await statusReport(ctx, pi, session);

  deliverCommandReport(ctx, pi, {
    body: report.body,
    severity: report.severity,
  });
}

/**
 * Load the presets and build the status report, ending with the `Config:`
 * block and the configuration's warnings. It is a warning when the active
 * preset is no longer loaded.
 */
export async function statusReport(
  ctx: ExtensionCommandContext,
  pi: Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">,
  session: ActivePresetSession,
): Promise<PresetsReport> {
  const { config, presets } = await loadPresetsConfig(ctx);
  const assessment = session.assess(ctx, pi);
  const report = (
    rows: readonly ReportRow[],
    severity: PresetsReport["severity"],
  ) =>
    presetsReport(
      "Status",
      { config: config.statusLines, rows, warnings: config.statusWarnings },
      severity,
    );

  if (!assessment) return report(["No preset is active."], "info");

  const { active } = assessment;

  if (!findPreset(presets, active)) {
    return report(
      [`Active preset "${active.name}" is no longer loaded.`],
      "warning",
    );
  }

  return report(statusRows(assessment), "info");
}

/**
 * The rows for the active preset. A session whose baseline was never
 * captured gets the shorter list that omits the baseline and preset rows.
 */
function statusRows({
  active,
  current,
  overlay,
}: OverlayAssessment): ReportRow[] {
  if (!overlay) {
    return [
      [`${PRESET_LABEL}:`, active.name],
      [`${SCOPE_LABEL}:`, formatScopeName(active.scope)],
      [
        `${RESTORE_LABEL}:`,
        "No saved baseline. Clear will only turn the preset off.",
      ],
      [`${CURRENT_MODEL_LABEL}:`, formatModel(current.model)],
      [`${CURRENT_THINKING_LABEL}:`, current.thinkingLevel],
      [`${CURRENT_TOOLS_LABEL}:`, formatTools(current.tools)],
    ];
  }

  const { baseline, written } = overlay;
  const toolsWording =
    overlay.tools === "not-owned"
      ? "Not managed by active preset"
      : OVERLAY_FIELD_WORDING[overlay.tools];

  return [
    [`${PRESET_LABEL}:`, active.name],
    [`${SCOPE_LABEL}:`, formatScopeName(active.scope)],
    [`${BASELINE_MODEL_LABEL}:`, formatModel(baseline.model)],
    [`${BASELINE_THINKING_LABEL}:`, baseline.thinkingLevel],
    [`${BASELINE_TOOLS_LABEL}:`, formatTools(baseline.tools)],
    [`${PRESET_MODEL_LABEL}:`, formatModel(written.model)],
    [`${PRESET_THINKING_LABEL}:`, written.thinkingLevel],
    [
      `${PRESET_TOOLS_LABEL}:`,
      written.tools ? formatTools(written.tools) : "none",
    ],
    [
      `${CURRENT_MODEL_LABEL}:`,
      `${formatModel(current.model)} (${OVERLAY_FIELD_WORDING[overlay.model]})`,
    ],
    [
      `${CURRENT_THINKING_LABEL}:`,
      `${current.thinkingLevel} (${OVERLAY_FIELD_WORDING[overlay.thinking]})`,
    ],
    [
      `${CURRENT_TOOLS_LABEL}:`,
      `${formatTools(current.tools)} (${toolsWording})`,
    ],
  ];
}
