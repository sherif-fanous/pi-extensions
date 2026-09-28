/**
 * Delivers a command report as a durable transcript entry in TUI mode and
 * as a notification everywhere else.
 */
import { createCommandReport } from "@sherif-fanous/pi-extensions-core";

const commandReport = createCommandReport("presets-plus:command-report");

/** Entry type the report renderer registers under. */
export const COMMAND_REPORT_ENTRY_TYPE = commandReport.entryType;

/** Render a stored report entry as themed transcript text. */
export const renderCommandReport = commandReport.render;

/** Show a report through the transcript in TUI mode, or a notification. */
export const deliverCommandReport = commandReport.deliver;

/** Register the report renderer so stored entries survive a reload. */
export const registerCommandReportRenderer = commandReport.register;

/**
 * End a report body with its warnings as one `Warnings:` block of `- `
 * lines, or return the body unchanged when there are none.
 */
export function appendReportWarnings(
  body: string,
  warnings: readonly string[],
): string {
  if (warnings.length === 0) return body;

  return `${body}\n\nWarnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`;
}
