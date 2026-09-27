/**
 * Turns the outcome of a preset activation into notifications: one info
 * notification that folds in any info notices, and the warning notices as
 * warnings.
 */
import type { ApplyResult } from "../activation/apply.js";
import type { LoadedPreset } from "../types.js";
import { reportWarnings } from "../warnings.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Deliver one activation outcome through the current human-facing UI.
 *
 * Warning notices go into `warnings` when the caller collects them, and
 * otherwise out as one warning notification.
 */
export function notifyApplyResult(
  ctx: Pick<ExtensionContext, "ui">,
  preset: Pick<LoadedPreset, "name">,
  result: ApplyResult,
  warnings?: string[],
): void {
  if (!result.ok) {
    ctx.ui.notify(result.reason, "error");

    return;
  }

  if (result.applied === false) return;

  const notices = result.notices ?? [];
  const body = [
    `Preset "${preset.name}" applied.`,
    ...notices
      .filter((notice) => notice.severity === "info")
      .map((notice) => notice.message),
  ].join("\n");

  ctx.ui.notify(body, "info");
  reportWarnings(
    ctx,
    notices
      .filter((notice) => notice.severity === "warning")
      .map((notice) => notice.message),
    warnings,
  );
}
