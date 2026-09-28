/**
 * Wording the clear and status reports share: model and tool values, and
 * the phrase for each way a current value relates to the preset overlay.
 */
import type { OverlayFieldClassification } from "../activation/classify-overlay-field.js";

/** The phrase a report row uses for each {@link OverlayFieldClassification}. */
export const OVERLAY_FIELD_WORDING: Record<OverlayFieldClassification, string> =
  {
    "already-baseline": "Already at baseline",
    "matches-last-applied": "Managed by active preset",
    "user-override": "Left as-is because you changed it after activation",
  };

/** Format a model reference as `provider/id`, or `none` when unset. */
export function formatModel(
  model: { provider: string; id: string } | null,
): string {
  return model ? `${model.provider}/${model.id}` : "none";
}

/** Format a tool list as a comma-separated string, or `none` when empty. */
export function formatTools(tools: readonly string[]): string {
  return tools.length > 0 ? tools.join(", ") : "none";
}
