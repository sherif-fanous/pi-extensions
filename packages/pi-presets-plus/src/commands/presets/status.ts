/**
 * Reports `/presets status`: which preset is active, the baseline it
 * overlays, how the session's current model, thinking level, and tools
 * compare against both, and the state of each configuration file.
 */
import { assessOverlay } from "../../activation/overlay-assessment.js";
import type { ActivePresetSession } from "../../activation/session.js";
import { findPreset } from "../../preset-identity.js";
import { loadAll } from "../../store/api.js";
import type { ActivePresetState } from "../../types.js";
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
  const active = session.current();
  const { config, presets } = await loadAll(ctx);
  const report = (
    rows: readonly ReportRow[],
    severity: PresetsReport["severity"],
  ) =>
    presetsReport(
      "Status",
      { config: config.statusLines, rows, warnings: config.statusWarnings },
      severity,
    );

  if (!active) return report(["No preset is active."], "info");

  if (!findPreset(presets, active)) {
    return report(
      [`Active preset "${active.name}" is no longer loaded.`],
      "warning",
    );
  }

  return report(statusRows(active, ctx, pi), "info");
}

/**
 * The rows for the active preset. A session whose baseline was never
 * captured gets the shorter list that omits the baseline and preset rows.
 */
function statusRows(
  active: ActivePresetState,
  ctx: Pick<ExtensionCommandContext, "model">,
  pi: Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">,
): ReportRow[] {
  const currentModel = ctx.model
    ? { provider: ctx.model.provider, id: ctx.model.id }
    : null;
  const currentThinking = pi.getThinkingLevel();
  const currentTools = pi.getActiveTools();
  const assessment = assessOverlay(active, {
    model: currentModel,
    thinkingLevel: currentThinking,
    tools: currentTools,
  });

  if (assessment.kind === "unknown") {
    return [
      [`${PRESET_LABEL}:`, active.name],
      [`${SCOPE_LABEL}:`, formatScopeName(active.scope)],
      [
        `${RESTORE_LABEL}:`,
        "No saved baseline. Clear will only turn the preset off.",
      ],
      [`${CURRENT_MODEL_LABEL}:`, formatModel(currentModel)],
      [`${CURRENT_THINKING_LABEL}:`, currentThinking],
      [`${CURRENT_TOOLS_LABEL}:`, formatTools(currentTools)],
    ];
  }

  const { baseline, lastApplied } = assessment.restore;
  const toolsWording =
    assessment.tools === "not-owned"
      ? "Not managed by active preset"
      : OVERLAY_FIELD_WORDING[assessment.tools];

  return [
    [`${PRESET_LABEL}:`, active.name],
    [`${SCOPE_LABEL}:`, formatScopeName(active.scope)],
    [`${BASELINE_MODEL_LABEL}:`, formatModel(baseline.model)],
    [`${BASELINE_THINKING_LABEL}:`, baseline.thinkingLevel],
    [`${BASELINE_TOOLS_LABEL}:`, formatTools(baseline.tools)],
    [`${PRESET_MODEL_LABEL}:`, formatModel(lastApplied.model)],
    [`${PRESET_THINKING_LABEL}:`, lastApplied.thinkingLevel],
    [
      `${PRESET_TOOLS_LABEL}:`,
      lastApplied.tools ? formatTools(lastApplied.tools) : "none",
    ],
    [
      `${CURRENT_MODEL_LABEL}:`,
      `${formatModel(currentModel)} (${OVERLAY_FIELD_WORDING[assessment.model]})`,
    ],
    [
      `${CURRENT_THINKING_LABEL}:`,
      `${currentThinking} (${OVERLAY_FIELD_WORDING[assessment.thinking]})`,
    ],
    [
      `${CURRENT_TOOLS_LABEL}:`,
      `${formatTools(currentTools)} (${toolsWording})`,
    ],
  ];
}
