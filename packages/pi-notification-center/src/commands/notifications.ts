/**
 * The `/notifications` command.
 *
 * Owns reading the active session branch on every invocation and opening
 * the focused history overlay. It does NOT own capture, persistence,
 * formatting, or scrolling.
 *
 * The branch is re-read per invocation rather than cached so resumed
 * sessions, reloads, and branch navigation are always reflected.
 */

import { readNotificationHistory } from "../history.js";
import { isInteractiveTui } from "../interactive.js";
import { HISTORY_EMPTY_MESSAGE } from "../ui/history-format.js";
import {
  HISTORY_MAX_HEIGHT_PERCENT,
  HistoryViewComponent,
} from "../ui/history-view.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Minimal command-context surface used to open the overlay. */
export type NotificationsCommandContext = Pick<
  ExtensionCommandContext,
  "mode" | "sessionManager"
> & {
  ui: Pick<ExtensionCommandContext["ui"], "custom" | "notify">;
};

/**
 * Show notification history for the active branch.
 *
 * Outside the interactive TUI there is no overlay to open, so the command
 * falls back to a plain notification, which each non-TUI mode renders in
 * its own documented way.
 */
export async function runNotificationsCommand(
  ctx: NotificationsCommandContext,
): Promise<void> {
  const entries = readNotificationHistory(ctx.sessionManager.getBranch());

  if (!isInteractiveTui(ctx)) {
    ctx.ui.notify(
      entries.length === 0
        ? HISTORY_EMPTY_MESSAGE
        : `${String(entries.length)} notifications have been captured in this session.`,
      "info",
    );

    return;
  }

  await ctx.ui.custom<void>(
    (tui, theme, keybindings, done) =>
      new HistoryViewComponent({
        done: () => {
          done();
        },
        entries,
        keybindings,
        terminalHeight: () => tui.terminal.rows,
        theme,
      }),
    {
      overlay: true,
      // Two panes need real width. A percentage keeps the browser usable
      // on a narrow terminal, where the component falls back to its own
      // minimum and the panes stop shrinking.
      overlayOptions: {
        // Same ceiling the component sizes itself to, so its last row is
        // never clipped away.
        maxHeight: `${HISTORY_MAX_HEIGHT_PERCENT}%`,
        minWidth: HISTORY_MIN_WIDTH,
        width: "80%",
      },
    },
  );
}

/** Narrowest overlay worth requesting for the two-pane browser. */
const HISTORY_MIN_WIDTH = 60;
