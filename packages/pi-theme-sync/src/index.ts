/** Registers the `/theme-sync` command and session lifecycle handlers. */

import { runThemeSyncCommand } from "./commands/theme-sync.js";
import { EXTENSION_NAME } from "./extension-name.js";
import { createThemeSyncRuntime } from "./runtime.js";
import { registerStatusReportRenderer } from "./ui/status-report.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  guardCommand,
  onEvent,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

/** Register theme sync with Pi's extension API. */
export default function themeSync(pi: ExtensionAPI): void {
  // Pi 0.99 added `getSettings`; the pinned Pi types predate it.
  const getSettings = (pi as { getSettings?: () => { theme?: unknown } })
    .getSettings;
  const runtime = createThemeSyncRuntime({
    readThemeSetting: () => {
      try {
        const theme = getSettings?.call(pi).theme;

        return typeof theme === "string" ? theme : undefined;
      } catch {
        return undefined;
      }
    },
  });

  registerStatusReportRenderer(pi);
  pi.registerCommand("theme-sync", {
    description: "Configure Theme Sync or show its status",
    getArgumentCompletions: subcommandCompletions([
      { name: "status", description: "Show Theme Sync status" },
    ]),
    handler: guardCommand(EXTENSION_NAME, (args, ctx) =>
      runThemeSyncCommand(args, ctx, { pi, runtime }),
    ),
  });

  onEvent(pi, EXTENSION_NAME, "session_start", (_event, ctx) =>
    runtime.startSession(ctx),
  );

  pi.on("session_shutdown", () => {
    try {
      runtime.dispose();
    } catch {
      // Pi provides no UI context during shutdown, so dispose cannot report errors.
    }
  });
}
