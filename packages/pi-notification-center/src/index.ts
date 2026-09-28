/**
 * Extension entry point. Registers the `/notifications` command, loads
 * configuration and installs the capture runtime at each session start,
 * and tears the runtime down at shutdown.
 */

import { CaptureRuntime } from "./capture.js";
import { runNotificationsCommand } from "./commands/notifications.js";
import { loadStartupConfig, type LoadedConfig } from "./config.js";
import { EXTENSION_NAME } from "./extension-name.js";
import type { NotificationSeverity } from "./types.js";
import { registerStatusReportRenderer } from "./ui/status-report.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  guardCommand,
  guardEvent,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

/** Register the notification center with the Pi host. */
export default function notificationCenter(pi: ExtensionAPI): void {
  let runtime: CaptureRuntime | undefined;
  /** The configuration the current session started with. */
  let session: LoadedConfig | undefined;
  /** Counts starts and shutdowns, so a start that a newer one replaced stops. */
  let generation = 0;

  registerStatusReportRenderer(pi);

  pi.registerCommand("notifications", {
    description: "Browse this session's notifications",
    getArgumentCompletions: subcommandCompletions([
      { description: "Show Notification Center status", name: "status" },
    ]),
    handler: guardCommand(EXTENSION_NAME, (args, ctx) =>
      runNotificationsCommand(args, ctx, {
        pi,
        sessionConfig: () => session,
        toastsActive: () => runtime !== undefined,
      }),
    ),
  });

  pi.on(
    "session_start",
    guardEvent(EXTENSION_NAME, "session_start", async (_event, ctx) => {
      // A reload fires `session_start` again, so drop the previous runtime
      // before installing a new wrapper or its timers and overlay leak.
      runtime?.dispose();
      runtime = undefined;
      session = undefined;
      generation += 1;

      const start = generation;
      const startup = await loadStartupConfig(ctx);

      // A reload or shutdown while the file was read owns the session now.
      if (start !== generation) return;

      session = startup;
      runtime = CaptureRuntime.startSession(ctx, pi, startup.config);

      // Messages go out after installation so they travel the capture
      // path rather than the transcript. Outside the TUI there is no
      // runtime, and the untouched notify is the only way to reach the
      // user.
      const capture = runtime;
      const reportContext = capture
        ? {
            ui: {
              notify: (message: string, type: NotificationSeverity) => {
                capture.report(message, type);
              },
            },
          }
        : ctx;

      startup.outcome.notify(reportContext);
    }),
  );

  pi.on("session_shutdown", () => {
    generation += 1;

    try {
      runtime?.dispose();
    } catch {
      // Pi provides no UI context during shutdown, so dispose cannot report errors.
    }

    runtime = undefined;
    session = undefined;
  });
}
