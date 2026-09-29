/**
 * Runs Notification Center across Pi sessions: each session start loads
 * and migrates the configuration, installs capture, and shows what the
 * load found through capture; the status report reads what the session
 * started with.
 */

import { CaptureRuntime } from "./capture.js";
import { loadConfig, loadStartupConfig, type LoadedConfig } from "./config.js";
import { readNotificationHistory } from "./history.js";
import type { NotificationSeverity } from "./types.js";
import type { NotificationStatus } from "./ui/status-report.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Notification Center's session lifecycle and the status it reports. */
export interface NotificationCenterSession {
  /**
   * Stop capture, drop the session's configuration, and make any start
   * still loading do nothing.
   */
  dispose(): void;
  /**
   * The status report's content for `ctx`'s branch: the configuration the
   * current session started with, or the file as it is now when no
   * session has started, which never migrates it.
   */
  getStatus(ctx: ExtensionContext): Promise<NotificationStatus>;
  /**
   * Start a session, replacing any previous one: load and migrate the
   * configuration, install capture in the interactive TUI, and show the
   * outcome's messages through capture, or through `ctx.ui.notify` in
   * every other mode. A start that a later start or `dispose` overtakes
   * while it loads does nothing.
   */
  startSession(ctx: ExtensionContext): Promise<void>;
}

/** Create the session lifecycle for one extension instance. */
export function createNotificationCenterSession(
  pi: Pick<ExtensionAPI, "appendEntry">,
): NotificationCenterSession {
  let runtime: CaptureRuntime | undefined;
  /** The configuration the current session started with. */
  let loaded: LoadedConfig | undefined;
  /** Counts starts and disposals, so a start that a newer one replaced stops. */
  let generation = 0;

  const dispose = (): void => {
    const previous = runtime;

    generation += 1;
    runtime = undefined;
    loaded = undefined;
    previous?.dispose();
  };

  return {
    dispose,
    getStatus: async (ctx) => ({
      captured: readNotificationHistory(ctx.sessionManager.getBranch()).length,
      loaded: loaded ?? (await loadConfig(ctx)),
      toasts: runtime !== undefined,
    }),
    startSession: async (ctx) => {
      // A reload fires `session_start` again, so drop the previous runtime
      // before installing a new wrapper or its timers and overlay leak.
      dispose();

      const start = generation;
      const startup = await loadStartupConfig(ctx);

      // A reload or shutdown while the file was read owns the session now.
      if (start !== generation) return;

      loaded = startup;
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
    },
  };
}
