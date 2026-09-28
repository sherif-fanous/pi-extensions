/**
 * Runs `/presets clear`, which clears the active preset and shows the
 * clear report.
 */
import { clear } from "../../activation/clear.js";
import type { ActivePresetSession } from "../../activation/session.js";
import { deliverCommandReport } from "../../ui/command-report.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

/** Clear the active preset and deliver its report, or say none is active. */
export async function runClear(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<void> {
  const report = await clear(ctx, pi, session);

  if (!report) {
    ctx.ui.notify("No preset is active.", "info");

    return;
  }

  deliverCommandReport(ctx, pi, {
    body: report.body,
    severity: report.severity,
  });
}
