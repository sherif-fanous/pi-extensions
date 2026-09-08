/** Registers the `/theme-sync` command and session lifecycle handlers. */

import { openThemeSyncOverlay } from "./command.js";
import { createThemeSyncRuntime } from "./runtime.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Registers theme sync with Pi's extension API. */
export default function (pi: ExtensionAPI) {
  const runtime = createThemeSyncRuntime();

  pi.registerCommand("theme-sync", {
    description: "Open theme sync menu",

    handler: async (_args, ctx) => {
      try {
        await openThemeSyncOverlay(runtime, ctx);
      } catch (err) {
        ctx.ui.notify(
          `pi-theme-sync overlay failed: ${err instanceof Error ? err.message : String(err)}.`,
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
