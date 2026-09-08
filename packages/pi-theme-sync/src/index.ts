/** Registers the `/theme-sync` command and session lifecycle handlers. */

import { runThemeSyncCommand } from "./command.js";
import { createThemeSyncRuntime } from "./runtime.js";
import { registerStatusReportRenderer } from "./ui/status-report.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Registers theme sync with Pi's extension API. */
export default function (pi: ExtensionAPI) {
  const runtime = createThemeSyncRuntime();

  registerStatusReportRenderer(pi);
  pi.registerCommand("theme-sync", {
    description: "Configure theme sync or report its status",
    getArgumentCompletions: (prefix) => {
      const argument = prefix.trimStart();

      return !argument.includes(" ") && "status".startsWith(argument)
        ? [{ value: "status", label: "status: show theme sync status" }]
        : null;
    },

    handler: async (args, ctx) => {
      try {
        await runThemeSyncCommand(args, runtime, ctx, pi);
      } catch (err) {
        ctx.ui.notify(
          `Theme sync command failed: ${err instanceof Error ? err.message : String(err)}.`,
          "error",
        );
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      await runtime.setupAppearanceMonitoring(ctx);
    } catch (err) {
      ctx.ui.notify(
        `pi-theme-sync session_start failed: ${err instanceof Error ? err.message : String(err)}.`,
        "error",
      );
    }
  });

  pi.on("session_shutdown", () => {
    try {
      runtime.cleanup();
    } catch {
      // Pi provides no UI context during shutdown, so cleanup cannot report errors.
    }
  });
}
