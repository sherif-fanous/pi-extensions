/** Routes `/theme-sync` and orchestrates configuration and status delivery. */

import { loadConfig } from "./config/load.js";
import { writeConfigChanges } from "./config/save.js";
import { EXTENSION_NAME } from "./extension-name.js";
import type { ThemeSyncRuntime } from "./runtime.js";
import { ConfigOverlayComponent } from "./ui/config-overlay.js";
import { deliverStatusReport, formatStatusReport } from "./ui/status-report.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  describeErrorSentence,
  notifyUsageWarning,
  overlayOptions,
  requireInteractiveTui,
} from "@sherif-fanous/pi-extensions-core";

/** Opens the interactive theme sync configuration overlay for a TUI session. */
export async function openThemeSyncOverlay(
  _runtime: ThemeSyncRuntime,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!requireInteractiveTui(ctx, EXTENSION_NAME, "/theme-sync")) return;

  const config = await loadConfig(ctx);
  let component: ConfigOverlayComponent | undefined;

  await ctx.ui.custom<void>(
    (tui, theme, keybindings, done) => {
      component = new ConfigOverlayComponent({
        config,
        done,
        keybindings,
        requestRender: () => tui.requestRender(),
        save: (scope, changes) => writeConfigChanges(scope, ctx, changes),
        terminalRows: () => tui.terminal?.rows ?? 24,
        theme,
        themeNames: ctx.ui.getAllThemes().map((item) => item.name),
      });

      return component;
    },
    { overlay: true, overlayOptions: overlayOptions("main") },
  );

  if (!component?.reloadRequested) return;

  // Reload only after the overlay closes, so no stale overlay survives it.
  try {
    await ctx.reload();
  } catch (error) {
    ctx.ui.notify(
      `Could not reload Pi: ${describeErrorSentence(error)}`,
      "error",
    );
  }
}

/** Routes the command argument to configuration, status, or a usage warning. */
export async function runThemeSyncCommand(
  args: string,
  runtime: ThemeSyncRuntime,
  ctx: ExtensionCommandContext,
  pi: Pick<ExtensionAPI, "appendEntry">,
): Promise<void> {
  const argument = args.trim();

  if (argument.length === 0) {
    await openThemeSyncOverlay(runtime, ctx);

    return;
  }

  if (argument === "status") {
    deliverStatusReport(ctx, pi, {
      body: formatStatusReport(runtime.getStatus(ctx)),
    });

    return;
  }

  notifyUsageWarning(ctx, EXTENSION_NAME, argument, [
    "/theme-sync",
    "/theme-sync status",
  ]);
}
