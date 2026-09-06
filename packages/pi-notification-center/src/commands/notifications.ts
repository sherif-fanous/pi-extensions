/**
 * The `/notifications` command.
 *
 * Owns reading the active session branch on every invocation and opening
 * the focused history overlay. It does NOT own capture, persistence,
 * formatting, or scrolling.
 *
 * The branch is re-read per invocation rather than cached so resumed
 * sessions, reloads, and branch navigation are always reflected.
 *
 * A terminal too narrow for the browser is answered in words rather than
 * with a cut-off frame, reusing the summary the non-TUI modes already
 * get. The check happens here because Pi hands over a terminal size only
 * inside the component factory, by which point the overlay exists.
 */

import { readNotificationHistory } from "../history.js";
import { isInteractiveTui } from "../interactive.js";
import type { NotificationEntry } from "../types.js";
import { HISTORY_EMPTY_MESSAGE } from "../ui/history-format.js";
import {
  canShowHistoryBrowser,
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
 * Current terminal width, or `undefined` when it cannot be read.
 *
 * A test seam, matching the injected terminal height the browser already
 * takes.
 */
export type TerminalWidthReader = () => number | undefined;

/**
 * Show notification history for the active branch.
 *
 * Outside the interactive TUI there is no overlay to open, so the command
 * falls back to a plain notification, which each non-TUI mode renders in
 * its own documented way. A terminal too narrow for the browser gets the
 * same summary.
 *
 * An unreadable terminal width opens the browser rather than suppressing
 * it. The overlay carries the same test as a visibility predicate, so a
 * terminal that turns out to be too narrow still draws nothing; guessing
 * the other way would withhold a browser that would have worked.
 */
export async function runNotificationsCommand(
  ctx: NotificationsCommandContext,
  terminalWidth: TerminalWidthReader = defaultTerminalWidth,
): Promise<void> {
  const entries = readNotificationHistory(ctx.sessionManager.getBranch());
  const width = terminalWidth();

  if (
    !isInteractiveTui(ctx) ||
    (width !== undefined && !canShowHistoryBrowser(width))
  ) {
    ctx.ui.notify(summarize(entries), "info");

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
        // Pi calls this every render cycle, so narrowing the terminal
        // while the browser is open withdraws it without a resize
        // listener, and widening brings it back.
        visible: (termWidth) => canShowHistoryBrowser(termWidth),
        width: "80%",
      },
    },
  );
}

/** Narrowest overlay worth requesting for the two-pane browser. */
const HISTORY_MIN_WIDTH = 60;

function defaultTerminalWidth(): number | undefined {
  return process.stdout.columns;
}

function summarize(entries: readonly NotificationEntry[]): string {
  if (entries.length === 0) return HISTORY_EMPTY_MESSAGE;

  return entries.length === 1
    ? "1 notification has been captured in this session."
    : `${String(entries.length)} notifications have been captured in this session.`;
}
