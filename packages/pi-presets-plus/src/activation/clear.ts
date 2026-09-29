/**
 * Detaches the active preset and restores Pi to the baseline captured at
 * activation, leaving any field the user changed since then untouched.
 */
import { clearReport } from "../ui/clear-report.js";
import type { PresetsReport } from "../ui/command-report.js";
import { formatModel, formatTools } from "../ui/overlay-wording.js";
import type {
  ActivePresetSession,
  BaselineWrites,
  OverlayAssessment,
} from "./session.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

/** What a clear will write to Pi and how it will report each field. */
export interface ClearDecision {
  readonly parts: readonly ClearPart[];
  readonly writes: BaselineWrites;
}

/** One field's outcome in a clear, ready for the summary renderer. */
export interface ClearPart {
  readonly action: ClearAction;
  /** Baseline tools left out of the restore because Pi no longer has them. */
  readonly dropped?: readonly string[];
  readonly field: ClearField;
  /**
   * Value rendered after the field label.
   *
   * Restored and already-baseline rows carry the baseline value, rows the
   * clear left alone carry the user's current value, and `restore-failed`
   * carries the baseline value the clear could not reach.
   */
  readonly value: string;
}

/** What the clear did to one field, which the summary turns into prose. */
export type ClearAction =
  | "already-baseline"
  | "baseline-null"
  | "not-owned"
  | "restore-failed"
  | "restored"
  | "restored-partial"
  | "unknown"
  | "user-override";

/** Pi state channel that a clear reports on. */
export type ClearField = "model" | "thinking" | "tools";

/**
 * Run a clear and return its report, or `undefined` when no preset is
 * active.
 */
export async function clear(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<PresetsReport | undefined> {
  const assessment = session.assess(ctx, pi);

  if (!assessment) return undefined;

  const decision = decideClear(
    assessment,
    pi.getAllTools().map((tool) => tool.name),
  );
  const modelRestored = await session.clear(decision.writes, ctx, pi);

  return clearReport(
    assessment.active.name,
    modelRestored ? decision.parts : withModelRestoreFailed(decision),
  );
}

/**
 * Decide the writes and per-field outcomes for a clear from `assessment`,
 * writing nothing. `allTools` names the tools Pi has now, which a tools
 * restore is limited to.
 */
export function decideClear(
  assessment: OverlayAssessment,
  allTools: readonly string[],
): ClearDecision {
  const { current, overlay } = assessment;
  const currentModelDisplay = formatModel(current.model);
  const currentToolsDisplay = formatTools(current.tools);

  if (!overlay) {
    return {
      parts: [
        { action: "unknown", field: "model", value: currentModelDisplay },
        {
          action: "unknown",
          field: "thinking",
          value: current.thinkingLevel,
        },
        { action: "unknown", field: "tools", value: currentToolsDisplay },
      ],
      writes: {},
    };
  }

  const parts: ClearPart[] = [];
  const writes: {
    -readonly [K in keyof BaselineWrites]: BaselineWrites[K];
  } = {};
  const { baseline } = overlay;

  switch (overlay.model) {
    case "already-baseline":
      parts.push({
        action: "already-baseline",
        field: "model",
        value: formatModel(baseline.model),
      });

      break;
    case "matches-last-applied":
      if (baseline.model) {
        writes.model = baseline.model;
        parts.push({
          action: "restored",
          field: "model",
          value: formatModel(baseline.model),
        });
      } else {
        // Activation captured no prior model, which happens when Pi starts
        // without one selected. There is nothing to switch back to, so keep
        // the current model and report it as baseline-null.
        parts.push({
          action: "baseline-null",
          field: "model",
          value: currentModelDisplay,
        });
      }

      break;
    case "user-override":
      parts.push({
        action: "user-override",
        field: "model",
        value: currentModelDisplay,
      });

      break;
  }

  switch (overlay.thinking) {
    case "already-baseline":
      parts.push({
        action: "already-baseline",
        field: "thinking",
        value: baseline.thinkingLevel,
      });

      break;
    case "matches-last-applied":
      writes.thinkingLevel = baseline.thinkingLevel;
      parts.push({
        action: "restored",
        field: "thinking",
        value: baseline.thinkingLevel,
      });

      break;
    case "user-override":
      parts.push({
        action: "user-override",
        field: "thinking",
        value: current.thinkingLevel,
      });

      break;
  }

  if (overlay.tools === "not-owned") {
    parts.push({
      action: "not-owned",
      field: "tools",
      value: currentToolsDisplay,
    });
  } else {
    switch (overlay.tools) {
      case "already-baseline":
        parts.push({
          action: "already-baseline",
          field: "tools",
          value: formatTools(baseline.tools),
        });

        break;

      case "matches-last-applied": {
        const available = new Set(allTools);
        const filtered = baseline.tools.filter((toolName) =>
          available.has(toolName),
        );
        const dropped = baseline.tools.filter(
          (toolName) => !available.has(toolName),
        );

        writes.tools = filtered;
        parts.push({
          action: dropped.length > 0 ? "restored-partial" : "restored",
          dropped: dropped.length > 0 ? dropped : undefined,
          field: "tools",
          value: formatTools(filtered),
        });

        break;
      }

      case "user-override":
        parts.push({
          action: "user-override",
          field: "tools",
          value: currentToolsDisplay,
        });

        break;
    }
  }

  return { parts, writes };
}

/** The decision's parts with the model row reporting a failed restore. */
function withModelRestoreFailed(decision: ClearDecision): ClearPart[] {
  const target = decision.writes.model;

  return decision.parts.map((part) =>
    part.field === "model" && target
      ? {
          action: "restore-failed",
          field: "model",
          value: `${target.provider}/${target.id}`,
        }
      : part,
  );
}
