/**
 * Command reports: the plain-text body format, and delivery as a styled
 * transcript entry in TUI mode and as a notification everywhere else.
 */

import { isInteractiveTui } from "./interactive.js";
import type {
  EntryRenderer,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/**
 * Body text and severity of one command report.
 *
 * The body is stored as plain text, so a restored entry picks up the theme
 * active when it is rendered. `severity` defaults to `"info"`.
 */
export interface CommandReport {
  readonly body: string;
  readonly severity?: "info" | "warning";
}

/**
 * Delivery and rendering bound to one transcript entry type.
 *
 * Every member is a plain function, so callers can pass them around
 * without binding.
 */
export interface CommandReportChannel {
  /** Show a report as a transcript entry in TUI mode, or as a notification. */
  readonly deliver: (
    ctx: Pick<ExtensionContext, "mode" | "ui">,
    pi: Pick<ExtensionAPI, "appendEntry">,
    report: CommandReport,
  ) => void;
  /** Transcript entry type the reports are stored under. */
  readonly entryType: string;
  /** Register {@link CommandReportChannel.render} so entries survive a reload. */
  readonly register: (pi: Pick<ExtensionAPI, "registerEntryRenderer">) => void;
  /** Render a stored report as styled text. */
  readonly render: EntryRenderer<CommandReport>;
}

/** The parts of a report body {@link formatReport} lays out. */
export interface ReportParts {
  /**
   * The `Config:` block, such as a config outcome's `statusLines`. Left
   * out when empty.
   */
  readonly config?: readonly string[];
  /** A sentence on the line under the heading, not indented. */
  readonly lead?: string;
  /** The rows under the heading and lead. */
  readonly rows: readonly ReportRow[];
  /** Warnings, listed last under `Warnings:`. Left out when empty. */
  readonly warnings?: readonly string[];
}

/**
 * One row of a report: a `[label, value]` pair, with the label ending in a
 * colon, or a sentence on its own.
 */
export type ReportRow = readonly [label: string, value: string] | string;

/**
 * Align `label value` rows by padding every label to the longest one.
 *
 * Each row is indented by two spaces and its value follows the padded
 * label after one space. A sentence row is indented the same way and
 * takes no part in the alignment.
 */
export function alignLabelRows(rows: readonly ReportRow[]): string[] {
  const width = Math.max(
    0,
    ...rows.map((row) => (typeof row === "string" ? 0 : row[0].length)),
  );

  return rows.map((row) => {
    if (typeof row === "string") return `  ${row}`;

    const [label, value] = row;

    return `  ${label}${" ".repeat(width - label.length)} ${value}`;
  });
}

/**
 * Create the delivery and rendering functions for reports stored under
 * `entryType`.
 *
 * In TUI mode `deliver` appends the report as a transcript entry that
 * `render` styles; register the renderer at extension load so restored
 * sessions show it too. In other modes `deliver` notifies with the styled
 * body at the report's severity.
 */
export function createCommandReport(entryType: string): CommandReportChannel {
  const render: EntryRenderer<CommandReport> = (entry, _options, theme) =>
    new Text(styleReport(entry.data?.body ?? "", theme), 1, 0);

  return {
    deliver: (ctx, pi, report) => {
      if (isInteractiveTui(ctx)) {
        pi.appendEntry(entryType, report);

        return;
      }

      ctx.ui.notify(
        styleReport(report.body, ctx.ui.theme),
        report.severity ?? "info",
      );
    },
    entryType,
    register: (pi) => {
      pi.registerEntryRenderer(entryType, render);
    },
    render,
  };
}

/**
 * Lay out a plain report body headed `<displayName> <thing>`.
 *
 * The heading is followed by the lead, then the rows with their labels
 * aligned, then the `Config:` block, then a `Warnings:` line with one
 * `- <warning>` line per warning. A blank line separates the rows, the
 * config block, and the warnings.
 */
export function formatReport(
  displayName: string,
  thing: string,
  { config = [], lead, rows, warnings = [] }: ReportParts,
): string {
  const lines = [
    `${displayName} ${thing}`,
    ...(lead === undefined ? [] : [lead]),
    ...alignLabelRows(rows),
  ];

  if (config.length > 0) lines.push("", ...config);

  if (warnings.length > 0) {
    lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));
  }

  return lines.join("\n");
}

/**
 * Style a plain report body.
 *
 * The first line is the heading, in bold accent. A `Warnings:` line and
 * every line after it are warning-colored. On any other line that is not
 * a `- ` list item, the text up to and including the first colon is a
 * muted label, keeping its leading whitespace. Remaining lines are
 * unchanged.
 */
export function styleReport(
  body: string,
  theme: Pick<Theme, "bold" | "fg">,
): string {
  let inWarnings = false;

  return body
    .split("\n")
    .map((line, index) => {
      if (index === 0) return theme.fg("accent", theme.bold(line));

      if (line === "Warnings:") inWarnings = true;

      if (inWarnings) return theme.fg("warning", line);

      // A label ends at the first colon, which must be followed by
      // whitespace or end the line, so `C:\path` or `a:b` is not a label.
      const match = line.match(/^(?!\s*- )(\s*)([^:]+:)(\s.*)?$/);

      return match
        ? `${match[1] ?? ""}${theme.fg("muted", match[2] ?? "")}${match[3] ?? ""}`
        : line;
    })
    .join("\n");
}
