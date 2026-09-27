/** Formats theme sync runtime status reports and delivers them as command reports. */

import type { RuntimeStatus } from "../types.js";
import {
  alignLabelRows,
  createCommandReport,
} from "@sherif-fanous/pi-extensions-core";

const statusReport = createCommandReport("theme-sync:status-report");

/** Entry type used for durable theme sync status reports. */
export const STATUS_REPORT_ENTRY_TYPE = statusReport.entryType;

/** Renders a stored status report using the active transcript theme. */
export const renderStatusReport = statusReport.render;

/** Delivers status to the transcript in TUI mode or as a notification elsewhere. */
export const deliverStatusReport = statusReport.deliver;

/** Registers the status report renderer for current and restored sessions. */
export const registerStatusReportRenderer = statusReport.register;

/** Formats every user-relevant runtime status field as plain text. */
export function formatStatusReport(
  status: RuntimeStatus,
  formatTime: (timestamp: number) => string = (timestamp) =>
    new Date(timestamp).toLocaleString(),
): string {
  const lines = [
    "Theme Sync Status",
    ...alignLabelRows([
      ["Appearance:", status.currentAppearance],
      ["Applied Theme:", status.appliedTheme],
      ["Desired Theme:", status.desiredTheme ?? "n/a"],
      ["Sync Active:", status.syncStatus === "active" ? "yes" : "no"],
      ["Detection Strategy:", status.detectionStrategy],
      ["Available Detectors:", status.availableDetectors.join(", ") || "none"],
      ["Polling Interval:", `${String(status.pollIntervalMs)}ms`],
      [
        "Last Update:",
        status.lastUpdateAt !== undefined
          ? formatTime(status.lastUpdateAt)
          : "never",
      ],
      ["Last Event:", status.lastEvent],
    ]),
  ];

  if (status.warnings.length > 0) {
    lines.push(
      "",
      "Warnings:",
      ...status.warnings.map((warning) => `  - ${warning}`),
    );
  }

  return lines.join("\n");
}
