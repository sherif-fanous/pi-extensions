/**
 * Extension entry point. Registers the `/notifications` command, loads
 * configuration and installs the capture runtime at each session start,
 * and tears the runtime down at shutdown.
 */

import { CaptureRuntime } from "./capture.js";
import { runNotificationsCommand } from "./commands/notifications.js";
import { loadConfig, type LoadConfigResult } from "./config.js";
import { EXTENSION_NAME } from "./extension-name.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  guardCommand,
  guardEvent,
  notifyUsageWarning,
  notifyWarnings,
} from "@sherif-fanous/pi-extensions-core";

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
    description: "Browse this session's notifications",
    handler: guardCommand(EXTENSION_NAME, async (args, ctx) => {
      if (args.trim() !== "") {
        notifyUsageWarning(ctx, EXTENSION_NAME, args, ["/notifications"]);

        return;
      }

      await runNotificationsCommand(ctx);
    }),
  });

  pi.on(
    "session_start",
    guardEvent(EXTENSION_NAME, "session_start", (_event, ctx) => {
      // A reload fires `session_start` again, so drop the previous runtime
      // before installing a new wrapper or its timers and overlay leak.
      runtime?.dispose();
      runtime = undefined;

      const { config, warnings } = configLoader();

      runtime = CaptureRuntime.install(ctx, pi, config);

      // Warnings go out after installation so they travel the capture
      // path rather than the transcript. Outside the TUI there is no
      // runtime, and the untouched notify is the only way to reach the
      // user.
      const capture = runtime;
      const warningContext = capture
        ? {
            ui: {
              notify: (message: string) => {
                capture.warn(message);
              },
            },
          }
        : ctx;

      notifyWarnings(warningContext, EXTENSION_NAME, warnings);
    }),
  );

  pi.on("session_shutdown", () => {
    runtime?.dispose();
    runtime = undefined;
  });
}
