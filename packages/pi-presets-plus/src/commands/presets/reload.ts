/**
 * Runs `/presets reload`, which re-reads both scope files and reports how
 * many presets came back along with any warnings.
 */
import { loadAll } from "../../store/api.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { notifyWarnings } from "@sherif-fanous/pi-extensions-core";

/**
 * Re-read both preset files, notify how many presets came back, and show
 * any load warnings as one warning notification.
 */
export async function runReload(ctx: ExtensionContext): Promise<void> {
  const { presets, warnings } = await loadAll(ctx);

  ctx.ui.notify(
    `Reloaded ${presets.length} preset${presets.length === 1 ? "" : "s"}.`,
    "info",
  );
  notifyWarnings(ctx, "Presets Plus", warnings);
}
