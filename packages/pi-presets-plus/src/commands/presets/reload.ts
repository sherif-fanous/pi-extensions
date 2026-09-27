/**
 * Runs `/presets reload`, which re-reads both scope files, applies the
 * settings it can apply in place, and names the hotkey changes that still
 * need Pi's `/reload`.
 */
import type { ActivePresetSession } from "../../activation/session.js";
import type { HotkeyRegistry } from "../../hotkey-registry.js";
import { loadAll } from "../../store/api.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { notifyWarnings } from "@sherif-fanous/pi-extensions-core";

/**
 * Re-read both configuration files, apply `showInactiveStatus`, and notify
 * how many presets came back, which hotkey changes need `/reload`, and any
 * load warnings as one warning notification.
 */
export async function runReload(
  ctx: ExtensionContext,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  const { presets, showInactiveStatus, warnings } = await loadAll(ctx);

  session.setShowInactiveStatus(showInactiveStatus, ctx);

  const lines = [
    `Reloaded ${presets.length} preset${presets.length === 1 ? "" : "s"}.`,
  ];
  const changedHotkeys = hotkeys.changedHotkeyNames(presets);

  if (changedHotkeys.length > 0) {
    lines.push(
      `Hotkey changes for ${formatNames(changedHotkeys)} take effect after /reload.`,
    );
  }

  ctx.ui.notify(lines.join(" "), "info");
  notifyWarnings(ctx, "Presets Plus", warnings);
}

/** Quote each name and join them as `"a"`, `"a" and "b"`, or `"a", "b" and "c"`. */
function formatNames(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);

  if (quoted.length <= 1) return quoted.join("");

  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}
