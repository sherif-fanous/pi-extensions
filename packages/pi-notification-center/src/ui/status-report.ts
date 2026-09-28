/**
 * Formats the `/notifications status` report and delivers it as a command
 * report.
 */

import type { LoadedConfig } from "../config.js";
import { EXTENSION_NAME } from "../extension-name.js";
import {
  createCommandReport,
  formatReport,
  pluralize,
} from "@sherif-fanous/pi-extensions-core";

/** What the status report shows. */
export interface NotificationStatus {
  /** Notifications captured on the active branch. */
  readonly captured: number;
  /** The session's configuration and the file it came from. */
  readonly loaded: LoadedConfig;
  /** Whether captured notifications show as toasts in this session. */
  readonly toasts: boolean;
}

const statusReport = createCommandReport("notification-center:status-report");

/** Show a status report as a transcript entry in TUI mode, or a notification. */
export const deliverStatusReport = statusReport.deliver;

/** Register the status report renderer for current and restored sessions. */
export const registerStatusReportRenderer = statusReport.register;

/**
 * Format the status report: toasts and history, the effective toast
 * settings, the `Config:` block, and any warnings about invalid values or
 * a failed migration.
 */
export function formatStatusReport(status: NotificationStatus): string {
  const { toast } = status.loaded.config;

  return formatReport(EXTENSION_NAME, "Status", {
    config: status.loaded.outcome.statusLines,
    rows: [
      ["Toasts:", status.toasts ? "on" : "off"],
      ["Captured:", pluralize(status.captured, "notification")],
      ["Visible toasts:", `at most ${String(toast.maxVisible)}`],
      ["Toast timeout:", `${String(toast.timeoutMs)}ms`],
      ["Toast height:", `at most ${pluralize(toast.maxLines, "line")}`],
      ["Toast width:", `at most ${pluralize(toast.width, "column")}`],
    ],
    warnings: status.loaded.outcome.statusWarnings,
  });
}
