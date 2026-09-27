/** Routes `/theme-sync` and orchestrates configuration and status delivery. */

import { getConfigPath, loadConfig, writeConfigChanges } from "./config.js";
import type { ThemeSyncRuntime } from "./runtime.js";
import { ConfigOverlayComponent } from "./ui/config-overlay.js";
import { deliverStatusReport, formatStatusReport } from "./ui/status-report.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

/** Opens the interactive theme sync configuration overlay for a TUI session. */
export async function openThemeSyncOverlay(
  _runtime: ThemeSyncRuntime,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!requireUI(ctx, "/theme-sync")) return;

  const config = await loadConfig(ctx);
  let component: ConfigOverlayComponent | undefined;

  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) => {
      component = new ConfigOverlayComponent({
        config,
        done,
        resolvePaths: async () => {
          const [project, global] = await Promise.all([
            getConfigPath("project", ctx.cwd),
            getConfigPath("global", ctx.cwd),
          ]);

          return { project, global };
        },
        requestRender: () => tui.requestRender(),
        save: (scope, changes) => writeConfigChanges(scope, ctx.cwd, changes),
        terminalRows: () => tui.terminal?.rows ?? 24,
        theme,
        themeNames: ctx.ui.getAllThemes().map((item) => item.name),
      });

      return component;
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: 1,
        maxHeight: "90%",
        width: 80,
      },
    },
  );

  // Reload only after the overlay closes so the command observes failures.
  if (component?.reloadRequested) await ctx.reload();
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

  ctx.ui.notify("Usage: /theme-sync or /theme-sync status.", "warning");
}

function requireUI(ctx: ExtensionCommandContext, commandName: string): boolean {
  if (ctx.mode === "tui") return true;

  ctx.ui.notify(
    `Interactive TUI mode is required for ${commandName}.`,
    "error",
  );

  return false;
}
