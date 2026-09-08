/**
 * Extension entry point. Registers the `/notifications` command, loads
 * configuration and installs the capture runtime at each session start,
 * and tears the runtime down at shutdown.
 */

import { CaptureRuntime } from "./capture.js";
import { runNotificationsCommand } from "./commands/notifications.js";
import { loadConfig, type LoadConfigResult } from "./config.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Register the notification center with the Pi host.
 *
 * Pi calls this with the extension API alone, so `configLoader` is the
 * real loader in production. It exists as a seam because configuration is
 * loaded with no arguments here, putting the loader's own agent-directory
 * and file-reading parameters out of reach of a test.
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
      // A command handler that throws surfaces as an extension error row,
      // which is the transcript noise this package exists to avoid.
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
    // A reload fires `session_start` again, so drop the previous runtime
    // before installing a new wrapper or its timers and overlay leak.
    runtime?.dispose();
    runtime = undefined;

    try {
      const { config, warnings } = configLoader();

      runtime = CaptureRuntime.install(ctx, pi, config);

      // Warnings go out after installation so they travel the capture
      // path rather than the transcript. Outside the TUI there is no
      // runtime, and the untouched notify is the only way to reach the
      // user.
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
 * Describe an error as a sentence closing with exactly one full stop.
 *
 * Callers embed the result without adding a terminator of their own,
 * since a thrown message may already end in punctuation.
 */
function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  return /[!.?]$/u.test(message) ? message : `${message}.`;
}
