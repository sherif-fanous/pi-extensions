import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createThemeSyncRuntime } from "./runtime.js";
import { openThemeSyncOverlay } from "./command.js";

export default function (pi: ExtensionAPI) {
  const runtime = createThemeSyncRuntime();

  pi.registerCommand("theme-sync", {
    description: "Open theme sync menu",

    handler: async (_args, ctx) => {
      await openThemeSyncOverlay(runtime, ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await runtime.setupAppearanceMonitoring(ctx);
  });

  pi.on("session_shutdown", () => {
    runtime.cleanup();
  });
}
