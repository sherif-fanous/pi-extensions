/** Formats theme sync runtime status reports and delivers them as command reports. */

import { EXTENSION_NAME } from "../extension-name.js";
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
    `${EXTENSION_NAME} Status`,
    ...alignLabelRows([
      ["Appearance:", status.currentAppearance],
      ["Applied theme:", status.appliedTheme],
      ["Desired theme:", status.desiredTheme ?? "none"],
      ["Sync:", status.syncStatus === "active" ? "on" : "off"],
      ["Detection strategy:", status.detectionStrategy],
      ["Available detectors:", status.availableDetectors.join(", ") || "none"],
      ["Polling interval:", `${String(status.pollIntervalMs)}ms`],
      [
        "Last update:",
        status.lastUpdateAt !== undefined
          ? formatTime(status.lastUpdateAt)
          : "never",
      ],
      ["Last event:", status.lastEvent],
    ]),
  ];

  if (status.warnings.length > 0) {
    lines.push(
      "",
      "Warnings:",
      ...status.warnings.map((warning) => `- ${warning}`),
    );
  }

  return lines.join("\n");
}
