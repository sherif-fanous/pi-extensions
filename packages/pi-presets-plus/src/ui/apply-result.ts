/**
 * Turns the outcome of a preset activation into notifications: one info
 * notification that folds in any info notices, and the warning notices as
 * warnings.
 */
import type { ApplyResult } from "../activation/apply.js";
import { EXTENSION_NAME } from "../extension-name.js";
import type { LoadedPreset } from "../types.js";
import { reportWarnings } from "../warnings.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** How {@link notifyApplyResult} words and routes one activation outcome. */
export interface ApplyResultDelivery {
  /**
   * The activation ran without the user asking for it just then (at
   * startup or from a hotkey), so the success line names Presets Plus as
   * its subject.
   */
  readonly unprompted?: boolean;
  /** Collects the warning notices instead of notifying them. */
  readonly warnings?: string[];
}

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
  { unprompted = false, warnings }: ApplyResultDelivery = {},
): void {
  if (!result.ok) {
    ctx.ui.notify(result.reason, "error");

    return;
  }

  if (result.applied === false) return;

  const notices = result.notices ?? [];
  const body = [
    unprompted
      ? `${EXTENSION_NAME} applied preset "${preset.name}".`
      : `Preset "${preset.name}" applied.`,
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
