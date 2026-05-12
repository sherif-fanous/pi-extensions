/**
 * Extension entry point. Wires Pi's extension API to the theme-sync runtime
 * and to the `/theme-sync` interactive overlay.
 *
 * Owns the `/theme-sync` command registration and the `session_start` /
 * `session_shutdown` lifecycle bindings. Does NOT own runtime detection state
 * (lives in `runtime.ts`) or the interactive overlay UI (lives in
 * `command.ts`).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createThemeSyncRuntime } from "./runtime.js";
import { openThemeSyncOverlay } from "./command.js";

export default function (pi: ExtensionAPI) {
  const runtime = createThemeSyncRuntime();

  pi.registerCommand("theme-sync", {
    description: "Open theme sync menu",

    handler: async (_args, ctx) => {
      // Defense in depth: the overlay does its own error handling, but if
      // an unexpected throw escapes we surface it as a user-visible error
      // rather than letting it propagate up to Pi as an unhandled rejection.
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
    // Defense in depth: a failure here must NOT block Pi or other
    // extensions from completing session_start. Terminal-detector probes,
    // config reads, and intervaltimers can all throw; surface the error
    // and let the extension stay in a degraded-but-loaded state.
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
    // Defense in depth: shutdown must not throw. `ctx.ui` is generally not
    // available at this point so failures are swallowed; the runtime's own
    // cleanup handlers are best-effort and an unfreed listener at process
    // exit is preferable to an unhandled-rejection crash on the way out.
    try {
      runtime.cleanup();
    } catch {
      // Intentionally swallowed — see comment above.
    }
  });
}
