/**
 * Command reports: plain-text bodies that show as a styled transcript entry
 * in TUI mode and as a notification everywhere else.
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

/**
 * Align `label value` rows by padding every label to the longest one.
 *
 * Each row is indented by two spaces and its value follows the padded
 * label after one space.
 */
export function alignLabelRows(
  rows: readonly (readonly [label: string, value: string])[],
): string[] {
  const width = Math.max(0, ...rows.map(([label]) => label.length));

  return rows.map(
    ([label, value]) =>
      `  ${label}${" ".repeat(width - label.length)} ${value}`,
  );
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
 * Style a plain report body.
 *
 * The first line is the heading, in bold accent. A `Warnings:` line and
 * every line after it are warning-colored. On any other line, the text up
 * to and including the first colon is a muted label, keeping its leading
 * whitespace. Remaining lines are unchanged.
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
      const match = line.match(/^(\s*)([^:]+:)(\s.*)?$/);

      return match
        ? `${match[1] ?? ""}${theme.fg("muted", match[2] ?? "")}${match[3] ?? ""}`
        : line;
    })
    .join("\n");
}
