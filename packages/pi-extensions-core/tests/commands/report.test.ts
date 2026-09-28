/**
 * Covers command reports: the unified styling rules, label-row alignment,
 * and delivery as a transcript entry in TUI mode or a notification
 * elsewhere.
 */
import {
  alignLabelRows,
  createCommandReport,
  styleReport,
  type CommandReport,
} from "../../src/index.js";
import type {
  CustomEntry,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createMarkerTheme } from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it, vi } from "vitest";

const BODY = [
  "Theme Sync Status",
  "  Appearance:    dark",
  "Plain sentence without a label",
  "",
  "  Not a label at C:\\Users or team:plan.",
  "Warnings:",
  "  - First warning.",
  "Second: warning",
].join("\n");

function reportContext(
  mode: ExtensionContext["mode"],
  notify: ExtensionContext["ui"]["notify"],
): Pick<ExtensionContext, "mode" | "ui"> {
  return {
    mode,
    ui: { notify, theme: createMarkerTheme() },
  } as Pick<ExtensionContext, "mode" | "ui">;
}

describe("styleReport", () => {
  const lines = styleReport(BODY, createMarkerTheme()).split("\n");

  it("styles the first line as a bold accent heading", () => {
    expect(lines[0]).toBe("<accent><b>Theme Sync Status</b></accent>");
  });

  it("mutes the label of a label row and keeps its indent and value", () => {
    expect(lines[1]).toBe("  <muted>Appearance:</muted>    dark");
  });

  it("leaves a line without a label unchanged", () => {
    expect(lines[2]).toBe("Plain sentence without a label");
    expect(lines[3]).toBe("");
  });

  it("does not treat a colon inside a word as a label", () => {
    expect(lines[4]).toBe("  Not a label at C:\\Users or team:plan.");
  });

  it("colors the Warnings: line and every line after it as warnings", () => {
    expect(lines.slice(5)).toEqual([
      "<warning>Warnings:</warning>",
      "<warning>  - First warning.</warning>",
      "<warning>Second: warning</warning>",
    ]);
  });
});

describe("alignLabelRows", () => {
  it("pads every label to the longest one", () => {
    expect(
      alignLabelRows([
        ["Binary:", "rtk 0.1"],
        ["Session toggle:", "enabled"],
      ]),
    ).toEqual(["  Binary:         rtk 0.1", "  Session toggle: enabled"]);
  });
});

describe("createCommandReport", () => {
  const reports = createCommandReport("test:report");

  it("appends the report as an entry in TUI mode without notifying", () => {
    const appendEntry = vi.fn();
    const notify = vi.fn();
    const report: CommandReport = { body: BODY, severity: "warning" };

    reports.deliver(reportContext("tui", notify), { appendEntry }, report);

    expect(appendEntry).toHaveBeenCalledWith("test:report", report);
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies the styled body at the report severity outside TUI mode", () => {
    const appendEntry = vi.fn();
    const notify = vi.fn();

    reports.deliver(
      reportContext("rpc", notify),
      { appendEntry },
      { body: BODY, severity: "warning" },
    );

    expect(notify).toHaveBeenCalledWith(
      styleReport(BODY, createMarkerTheme()),
      "warning",
    );
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it("notifies at info severity when the report sets none", () => {
    const notify = vi.fn();

    reports.deliver(
      reportContext("print", notify),
      { appendEntry: vi.fn() },
      { body: "Heading" },
    );

    expect(notify).toHaveBeenCalledWith(
      "<accent><b>Heading</b></accent>",
      "info",
    );
  });

  it("renders a stored entry with the styled body", () => {
    const entry: CustomEntry<CommandReport> = {
      customType: "test:report",
      data: { body: "Heading\n  Label: value" },
      id: "entry-1",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "custom",
    };
    const rendered = reports
      .render(entry, { expanded: false }, createMarkerTheme())
      ?.render(200)
      .map((line) => line.trim());

    expect(rendered).toEqual([
      "<accent><b>Heading</b></accent>",
      "<muted>Label:</muted> value",
    ]);
  });

  it("registers its renderer under the entry type", () => {
    const registerEntryRenderer = vi.fn();

    reports.register({ registerEntryRenderer });

    expect(reports.entryType).toBe("test:report");
    expect(registerEntryRenderer).toHaveBeenCalledWith(
      "test:report",
      reports.render,
    );
  });
});
