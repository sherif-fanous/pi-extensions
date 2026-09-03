/**
 * pi-notification-center extension entry point.
 *
 * Owns lifecycle wiring with the Pi host: command registration,
 * per-session installation of the capture runtime, configuration
 * loading, and shutdown cleanup. It does NOT own interception mechanics,
 * rendering, configuration validation, or history access — those live in
 * their dedicated modules.
 */

import { CaptureRuntime } from "./capture.js";
import { runNotificationsCommand } from "./commands/notifications.js";
import { loadConfig, type LoadConfigResult } from "./config.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Register the notification center with the Pi host.
 *
 * `configLoader` is a test seam only. Pi invokes this factory with the
 * extension API alone, so the real loader is what production uses.
 */
export default function notificationCenter(
  pi: ExtensionAPI,
  configLoader: () => LoadConfigResult = loadConfig,
): void {
  let runtime: CaptureRuntime | undefined;

  pi.registerCommand("notifications", {
    description:
      "Browse notifications captured in this session, newest first, with their local date, time, and severity.",
    handler: async (_args, ctx) => {
      // Defense in depth: a command handler that throws would surface as
      // an extension error row, which is exactly the transcript noise
      // this package exists to avoid.
      try {
        await runNotificationsCommand(ctx);
      } catch (err) {
        ctx.ui.notify(
          `The notification history could not be opened: ${describe(err)}.`,
          "error",
        );
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    // A reload fires `session_start` again; drop the previous runtime
    // before installing a new wrapper so timers and overlays cannot leak.
    runtime?.dispose();
    runtime = undefined;

    try {
      const { config, warnings } = configLoader();

      runtime = CaptureRuntime.install(ctx, pi, config);

      // Warnings are reported only after installation completes, so the
      // configuration complaint travels the same capture path as any
      // other notification instead of reaching the transcript.
      for (const warning of warnings) {
        if (runtime) {
          runtime.warn(warning);
        } else {
          ctx.ui.notify(warning, "warning");
        }
      }
    } catch (err) {
      ctx.ui.notify(
        `The notification center failed to start: ${describe(err)}.`,
        "error",
      );
    }
  });

  pi.on("session_shutdown", () => {
    runtime?.dispose();
    runtime = undefined;
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
