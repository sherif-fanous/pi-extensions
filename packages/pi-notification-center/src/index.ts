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
 * Pi invokes this factory with the extension API alone, so `configLoader`
 * defaults to the real loader in production.
 *
 * It is the only seam at this layer. Configuration is loaded with no
 * arguments, which leaves the loader's own agent-directory and
 * file-reading parameters unreachable from here, so substituting the
 * whole loader is the one way to exercise a warning or a failed load
 * through the host lifecycle. Without it a test would read the
 * developer's own agent directory and change behavior as soon as a real
 * configuration file appeared there.
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
          `The notification history could not be opened: ${describe(err)}`,
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
      //
      // Capture is absent outside the TUI, where the untouched notify is
      // the only way to reach the user. That cannot change part way
      // through, so the channel is chosen once for the whole batch.
      const capture = runtime;
      const warn = capture
        ? (message: string) => {
            capture.warn(message);
          }
        : (message: string) => {
            ctx.ui.notify(message, "warning");
          };

      for (const warning of warnings) {
        warn(warning);
      }
    } catch (err) {
      ctx.ui.notify(
        `The notification center failed to start: ${describe(err)}`,
        "error",
      );
    }
  });

  pi.on("session_shutdown", () => {
    runtime?.dispose();
    runtime = undefined;
  });
}

/**
 * Describe an error as a sentence closing with one full stop.
 *
 * A thrown message may already end in punctuation, so callers embed this
 * without adding their own terminator. Appending one unconditionally
 * renders a message as "Disk on fire.." to the user.
 */
function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  return /[!.?]$/u.test(message) ? message : `${message}.`;
}
