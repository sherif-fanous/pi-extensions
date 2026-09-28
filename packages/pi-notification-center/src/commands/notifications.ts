/**
 * The `/notifications` command. Reads the active session branch and opens
 * the history browser as a focused overlay, or shows the status report.
 *
 * The branch is re-read on every invocation, so resumed sessions,
 * reloads, and branch navigation are always reflected.
 */

import { loadConfig, type LoadedConfig } from "../config.js";
import { EXTENSION_NAME } from "../extension-name.js";
import { readNotificationHistory } from "../history.js";
import type { NotificationEntry } from "../types.js";
import { HISTORY_EMPTY_MESSAGE } from "../ui/history-format.js";
import {
  canShowHistoryBrowser,
  HistoryViewComponent,
} from "../ui/history-view.js";
import {
  deliverStatusReport,
  formatStatusReport,
} from "../ui/status-report.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  isInteractiveTui,
  notifyUsageWarning,
  overlayOptions,
  pluralize,
} from "@sherif-fanous/pi-extensions-core";

/** What `/notifications` needs besides its arguments and context. */
export interface NotificationsCommandDeps {
  readonly pi: Pick<ExtensionAPI, "appendEntry">;
  /** The configuration the current session started with, once it has. */
  readonly sessionConfig: () => LoadedConfig | undefined;
  /** Whether captured notifications show as toasts in this session. */
  readonly toastsActive: () => boolean;
}

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
 * Run `/notifications` with `args`: no argument opens the history, `status`
 * shows the status report, and anything else is a usage warning.
 */
export async function runNotificationsCommand(
  args: string,
  ctx: ExtensionCommandContext,
  deps: NotificationsCommandDeps,
): Promise<void> {
  const argument = args.trim();

  if (argument === "") {
    await showNotificationHistory(ctx);

    return;
  }

  if (argument === "status") {
    deliverStatusReport(ctx, deps.pi, {
      body: formatStatusReport({
        captured: readNotificationHistory(ctx.sessionManager.getBranch())
          .length,
        loaded: deps.sessionConfig() ?? (await loadConfig(ctx)),
        toasts: deps.toastsActive(),
      }),
    });

    return;
  }

  notifyUsageWarning(ctx, EXTENSION_NAME, argument, [
    "/notifications",
    "/notifications status",
  ]);
}

/**
 * Show notification history for the active branch.
 *
 * Outside the interactive TUI, and on a terminal too narrow for two
 * legible panes, the command answers with a plain notification summary
 * instead of an overlay. An unreadable terminal width opens the browser:
 * the overlay repeats the width test as a visibility predicate, so a
 * terminal that turns out to be too narrow still draws nothing.
 */
export async function showNotificationHistory(
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
