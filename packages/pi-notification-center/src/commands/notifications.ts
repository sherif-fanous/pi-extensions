/**
 * The `/notifications` command. Reads the active session branch and opens
 * the history browser as a focused overlay.
 *
 * The branch is re-read on every invocation, so resumed sessions,
 * reloads, and branch navigation are always reflected.
 */

import { readNotificationHistory } from "../history.js";
import type { NotificationEntry } from "../types.js";
import { HISTORY_EMPTY_MESSAGE } from "../ui/history-format.js";
import {
  canShowHistoryBrowser,
  HistoryViewComponent,
} from "../ui/history-view.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  isInteractiveTui,
  overlayOptions,
  pluralize,
} from "@sherif-fanous/pi-extensions-core";

/** Command-context surface used to open the overlay. */
export type NotificationsCommandContext = Pick<
  ExtensionCommandContext,
  "mode" | "sessionManager"
> & {
  ui: Pick<ExtensionCommandContext["ui"], "custom" | "notify">;
};

/** Current terminal width, or `undefined` when it cannot be read. */
export type TerminalWidthReader = () => number | undefined;

/**
 * Show notification history for the active branch.
 *
 * Outside the interactive TUI, and on a terminal too narrow for two
 * legible panes, the command answers with a plain notification summary
 * instead of an overlay. An unreadable terminal width opens the browser:
 * the overlay repeats the width test as a visibility predicate, so a
 * terminal that turns out to be too narrow still draws nothing.
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
      overlayOptions: {
        ...overlayOptions("main"),
        // Pi calls this every render cycle, so resizing the terminal
        // withdraws or restores the browser without a resize listener.
        visible: (termWidth) => canShowHistoryBrowser(termWidth),
      },
    },
  );
}

function defaultTerminalWidth(): number | undefined {
  return process.stdout.columns;
}

function summarize(entries: readonly NotificationEntry[]): string {
  if (entries.length === 0) return HISTORY_EMPTY_MESSAGE;

  const verb = entries.length === 1 ? "has" : "have";

  return `${pluralize(entries.length, "notification")} ${verb} been captured in this session.`;
}
