/**
 * Reports `/presets status`: which preset is active, the baseline it
 * overlays, and how the session's current model, thinking level, and
 * tools compare against both.
 */
import type { OverlayFieldClassification } from "../../activation/classify-overlay-field.js";
import { assessOverlay } from "../../activation/overlay-assessment.js";
import type { ActivePresetSession } from "../../activation/session.js";
import { findPreset } from "../../preset-identity.js";
import { loadAll } from "../../store/api.js";
import type { LoadedPreset } from "../../types.js";
import {
  appendReportWarnings,
  deliverCommandReport,
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
  STATUS_DIALOG_TITLE,
} from "../../ui/labels.js";
import { formatScopeName } from "../../ui/widgets.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { alignLabelRows } from "@sherif-fanous/pi-extensions-core";

/** Report text, its severity, and the warnings the preset load produced. */
export interface StatusBodyResult {
  readonly body: string;
  readonly severity: "info" | "warning";
  readonly warnings: readonly string[];
}

/**
 * Render the status report for the active preset.
 *
 * A session whose baseline was never captured gets the shorter report
 * that omits the baseline and preset rows.
 */
export function formatStatus(
  active: ReturnType<ActivePresetSession["current"]>,
  _preset: LoadedPreset,
  ctx: Pick<ExtensionCommandContext, "model">,
  pi: Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">,
): string {
  if (!active) return `${STATUS_DIALOG_TITLE}\n  No preset is active.`;

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
      STATUS_DIALOG_TITLE,
      ...alignLabelRows([
        [`${PRESET_LABEL}:`, active.name],
        [`${SCOPE_LABEL}:`, formatScopeName(active.scope)],
        [
          `${RESTORE_LABEL}:`,
          "No saved baseline. Clear will only turn the preset off.",
        ],
        [`${CURRENT_MODEL_LABEL}:`, formatModel(currentModel)],
        [`${CURRENT_THINKING_LABEL}:`, currentThinking],
        [`${CURRENT_TOOLS_LABEL}:`, formatTools(currentTools)],
      ]),
    ].join("\n");
  }

  const { baseline, lastApplied } = assessment.restore;
  const modelClass = statusLabel(assessment.model);
  const thinkingClass = statusLabel(assessment.thinking);
  const toolsClass =
    assessment.tools === "not-owned"
      ? "Not managed by active preset"
      : statusLabel(assessment.tools);

  return [
    STATUS_DIALOG_TITLE,
    ...alignLabelRows([
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
        `${formatModel(currentModel)} (${modelClass})`,
      ],
      [`${CURRENT_THINKING_LABEL}:`, `${currentThinking} (${thinkingClass})`],
      [
        `${CURRENT_TOOLS_LABEL}:`,
        `${formatTools(currentTools)} (${toolsClass})`,
      ],
    ]),
  ].join("\n");
}

/** Load the presets and build the status report, severity, and warnings. */
export async function formatStatusBody(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<StatusBodyResult> {
  const active = session.current();

  if (!active) {
    return {
      body: `${STATUS_DIALOG_TITLE}\n  No preset is active.`,
      severity: "info",
      warnings: [],
    };
  }

  const { presets, warnings } = await loadAll(ctx);
  const preset = findPreset(presets, active);

  if (!preset) {
    return {
      body: `${STATUS_DIALOG_TITLE}\n  Active preset "${active.name}" is no longer loaded.`,
      severity: "warning",
      warnings,
    };
  }

  return {
    body: formatStatus(active, preset, ctx, pi),
    severity: "info",
    warnings,
  };
}

/** Run `/presets status` and deliver the report to the user. */
export async function runStatus(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<void> {
  const result = await formatStatusBody(ctx, pi, session);

  const body = appendReportWarnings(result.body, result.warnings);

  deliverCommandReport(ctx, pi, {
    body,
    severity: result.severity,
  });
}

/**
 * Wording each {@link OverlayFieldClassification} gets in a status row.
 *
 * `renderClearSummary` annotates its rows with the same vocabulary, so a
 * phrase that changes here has to change there too.
 */
const STATUS_VOCABULARY: Record<OverlayFieldClassification, string> = {
  "already-baseline": "Already at baseline",
  "matches-last-applied": "Managed by active preset",
  "user-override": "Left as-is because you changed it after activation",
};

function formatModel(model: { provider: string; id: string } | null): string {
  return model ? `${model.provider}/${model.id}` : "none";
}

function formatTools(tools: readonly string[]): string {
  return tools.length > 0 ? tools.join(", ") : "none";
}

function statusLabel(classification: OverlayFieldClassification): string {
  return STATUS_VOCABULARY[classification];
}
