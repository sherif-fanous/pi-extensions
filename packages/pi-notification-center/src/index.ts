/** Registers the `/notifications` command and session lifecycle handlers. */

import { runNotificationsCommand } from "./commands/notifications.js";
import { EXTENSION_NAME } from "./extension-name.js";
import { createNotificationCenterSession } from "./session.js";
import { registerStatusReportRenderer } from "./ui/status-report.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  guardCommand,
  guardEvent,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

/** Register the notification center with the Pi host. */
export default function notificationCenter(pi: ExtensionAPI): void {
  const session = createNotificationCenterSession(pi);

  registerStatusReportRenderer(pi);

  pi.registerCommand("notifications", {
    description: "Browse this session's notifications",
    getArgumentCompletions: subcommandCompletions([
      { description: "Show Notification Center status", name: "status" },
    ]),
    handler: guardCommand(EXTENSION_NAME, (args, ctx) =>
      runNotificationsCommand(args, ctx, { pi, session }),
    ),
  });

  pi.on(
    "session_start",
    guardEvent(EXTENSION_NAME, "session_start", (_event, ctx) =>
      session.startSession(ctx),
    ),
  );

  pi.on("session_shutdown", () => {
    try {
      session.dispose();
    } catch {
      // Pi provides no UI context during shutdown, so dispose cannot report errors.
    }
  });
}
