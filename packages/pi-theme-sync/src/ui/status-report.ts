/** Formats, styles, registers, and delivers theme sync runtime status reports. */

import type { RuntimeStatus } from "../types.js";
import type {
  EntryRenderer,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/** Entry type used for durable theme sync status reports. */
export const STATUS_REPORT_ENTRY_TYPE = "theme-sync:status-report";

const STATUS_LABELS = [
  "Appearance:",
  "Applied Theme:",
  "Desired Theme:",
  "Sync Active:",
  "Detection Strategy:",
  "Available Detectors:",
  "Polling Interval:",
  "Last Update:",
  "Last Event:",
] as const;
const STATUS_LABEL_WIDTH = Math.max(
  ...STATUS_LABELS.map((label) => label.length),
);

/** Serializable data stored in a theme sync status transcript entry. */
export interface StatusReportData {
  readonly body: string;
}

/** Formats every user-relevant runtime status field as plain text. */
export function formatStatusReport(
  status: RuntimeStatus,
  formatTime: (timestamp: number) => string = (timestamp) =>
    new Date(timestamp).toLocaleString(),
): string {
  const lines = [
    "Theme Sync Status",
    statusRow("Appearance:", status.currentAppearance),
    statusRow("Applied Theme:", status.appliedTheme),
    statusRow("Desired Theme:", status.desiredTheme ?? "n/a"),
    statusRow("Sync Active:", status.syncStatus === "active" ? "yes" : "no"),
    statusRow("Detection Strategy:", status.detectionStrategy),
    statusRow(
      "Available Detectors:",
      status.availableDetectors.join(", ") || "none",
    ),
    statusRow("Polling Interval:", `${String(status.pollIntervalMs)}ms`),
    statusRow(
      "Last Update:",
      status.lastUpdateAt !== undefined
        ? formatTime(status.lastUpdateAt)
        : "never",
    ),
    statusRow("Last Event:", status.lastEvent),
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

/** Applies semantic theme colors to a plain status report. */
export function styleStatusReport(
  body: string,
  theme: Pick<Theme, "bold" | "fg">,
): string {
  let inWarnings = false;

  return body
    .split("\n")
    .map((line, index) => {
      if (index === 0) {
        return theme.fg("accent", theme.bold(line));
      }

      if (line === "Warnings:") {
        inWarnings = true;

        return theme.fg("warning", line);
      }

      if (inWarnings) {
        return theme.fg("warning", line);
      }

      const match = line.match(/^(\s*)([^:]+:)(.*)$/);

      return match
        ? `${match[1]}${theme.fg("muted", match[2] ?? "")}${match[3] ?? ""}`
        : line;
    })
    .join("\n");
}

function statusRow(
  label: (typeof STATUS_LABELS)[number],
  value: string,
): string {
  return `  ${label}${" ".repeat(STATUS_LABEL_WIDTH - label.length)} ${value}`;
}

/** Renders a stored status report using the active transcript theme. */
export const renderStatusReport: EntryRenderer<StatusReportData> = (
  entry,
  _options,
  theme,
) => new Text(styleStatusReport(entry.data?.body ?? "", theme), 1, 0);

/** Delivers status to the transcript in TUI mode or as a notification elsewhere. */
export function deliverStatusReport(
  ctx: Pick<ExtensionContext, "mode" | "ui">,
  pi: Pick<ExtensionAPI, "appendEntry">,
  data: StatusReportData,
): void {
  if (ctx.mode === "tui") {
    pi.appendEntry(STATUS_REPORT_ENTRY_TYPE, data);

    return;
  }

  ctx.ui.notify(styleStatusReport(data.body, ctx.ui.theme), "info");
}

/** Registers the status report renderer for current and restored sessions. */
export function registerStatusReportRenderer(
  pi: Pick<ExtensionAPI, "registerEntryRenderer">,
): void {
  pi.registerEntryRenderer(STATUS_REPORT_ENTRY_TYPE, renderStatusReport);
}
