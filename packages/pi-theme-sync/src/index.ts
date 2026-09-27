/** Registers the `/theme-sync` command and session lifecycle handlers. */

import { runThemeSyncCommand } from "./command.js";
import { createThemeSyncRuntime } from "./runtime.js";
import { registerStatusReportRenderer } from "./ui/status-report.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  guardCommand,
  guardEvent,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

/** Registers theme sync with Pi's extension API. */
export default function (pi: ExtensionAPI) {
  const runtime = createThemeSyncRuntime();

  registerStatusReportRenderer(pi);
  pi.registerCommand("theme-sync", {
    description: "Configure theme sync or report its status",
    getArgumentCompletions: subcommandCompletions([
      { name: "status", description: "show theme sync status" },
    ]),
    handler: guardCommand("Theme Sync", (args, ctx) =>
      runThemeSyncCommand(args, runtime, ctx, pi),
    ),
  });

  pi.on(
    "session_start",
    guardEvent("Theme Sync", "session_start", (_event, ctx) =>
      runtime.setupAppearanceMonitoring(ctx),
    ),
  );

  pi.on("session_shutdown", () => {
    try {
      runtime.cleanup();
    } catch {
      // Pi provides no UI context during shutdown, so cleanup cannot report errors.
    }
  });
}
