/**
 * Builds Presets Plus reports and delivers them as a durable transcript
 * entry in TUI mode and as a notification everywhere else.
 */
import { EXTENSION_NAME } from "../extension-name.js";
import {
  createCommandReport,
  formatReport,
  type CommandReport,
  type ReportParts,
} from "@sherif-fanous/pi-extensions-core";

/**
 * A finished report: the plain body, its severity, and its heading as a
 * title for a dialog that shows the body without the heading.
 */
export interface PresetsReport extends CommandReport {
  readonly severity: "info" | "warning";
  readonly title: string;
}

const commandReport = createCommandReport("presets-plus:command-report");

/** Entry type the report renderer registers under. */
export const COMMAND_REPORT_ENTRY_TYPE = commandReport.entryType;

/** Render a stored report entry as themed transcript text. */
export const renderCommandReport = commandReport.render;

/** Show a report through the transcript in TUI mode, or a notification. */
export const deliverCommandReport = commandReport.deliver;

/** Register the report renderer so stored entries survive a reload. */
export const registerCommandReportRenderer = commandReport.register;

/** Build the report headed `Presets Plus <thing>` from its parts. */
export function presetsReport(
  thing: string,
  parts: ReportParts,
  severity: PresetsReport["severity"],
): PresetsReport {
  return {
    body: formatReport(EXTENSION_NAME, thing, parts),
    severity,
    title: `${EXTENSION_NAME} ${thing}`,
  };
}
