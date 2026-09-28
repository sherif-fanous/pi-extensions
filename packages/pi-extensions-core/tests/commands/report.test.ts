/**
 * Covers command reports: the body layout, the styling rules and their
 * agreement with the shown-text checker, and delivery as a transcript
 * entry in TUI mode or a notification elsewhere.
 */
import {
  createCommandReport,
  formatReport,
  styleReport,
  type CommandReport,
} from "../../src/index.js";
import type {
  CustomEntry,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createMarkerTheme,
  createShownTextRecorder,
  findShownTextViolations,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it, vi } from "vitest";

const BODY = [
  "Theme Sync Status",
  "  Appearance:    dark",
  "Plain sentence without a label",
  "",
  "  Not a label at C:\\Users or team:plan.",
  "  - Listed: item",
  "Warnings:",
  "  - First warning.",
  "Second: warning",
].join("\n");
const CONFIG_LINES = [
  "Config:",
  "  User: loaded",
  "        /agent/theme-sync/config.json",
];

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

  it("does not treat a list item as a label", () => {
    expect(lines[5]).toBe("  - Listed: item");
  });

  it("colors the Warnings: line and every line after it as warnings", () => {
    expect(lines.slice(6)).toEqual([
      "<warning>Warnings:</warning>",
      "<warning>  - First warning.</warning>",
      "<warning>Second: warning</warning>",
    ]);
  });
});

describe("formatReport", () => {
  it("lays out the heading, lead, aligned rows, Config block, and warnings", () => {
    expect(
      formatReport("RTK", "Status", {
        config: CONFIG_LINES,
        lead: "Pi restored your previous settings.",
        rows: [
          ["Binary:", "rtk 0.1"],
          "A sentence row longer than every label.",
          ["Rewriting:", "on"],
        ],
        warnings: ["First warning.", "Second warning."],
      }),
    ).toBe(
      [
        "RTK Status",
        "Pi restored your previous settings.",
        "  Binary:    rtk 0.1",
        "  A sentence row longer than every label.",
        "  Rewriting: on",
        "",
        ...CONFIG_LINES,
        "",
        "Warnings:",
        "- First warning.",
        "- Second warning.",
      ].join("\n"),
    );
  });

  it("leaves out an absent lead and empty blocks", () => {
    expect(
      formatReport("RTK", "Status", {
        config: [],
        rows: ["No preset is active."],
        warnings: [],
      }),
    ).toBe("RTK Status\n  No preset is active.");
  });

  it("agrees with the shown-text checker on which lines are labels", () => {
    const body = formatReport("Theme Sync", "Status", {
      config: CONFIG_LINES,
      lead: "Pi kept all your manual changes.",
      rows: [
        ["Applied theme:", "dark"],
        ["Last Update:", "never"],
        "No theme applies to /repo.",
        "- Listed Item: value",
      ],
      warnings: ["Setting Name: is invalid."],
    });
    const shown = createShownTextRecorder();

    shown.appendEntry("theme-sync:status-report", { body });

    expect(
      findShownTextViolations(shown, {
        displayName: "Theme Sync",
        slug: "theme-sync",
      }),
    ).toEqual([
      `report ${JSON.stringify(body)}: label "Last Update:" is not in sentence case`,
    ]);

    expect(
      [
        ...styleReport(body, createMarkerTheme()).matchAll(
          /<muted>(.*?)<\/muted>/gu,
        ),
      ].map(([, label]) => label),
    ).toEqual(["Applied theme:", "Last Update:", "Config:", "User:"]);
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
