import { createNotificationEntry } from "../src/history.js";
import {
  formatHistoryDetail,
  formatHistoryRow,
  HISTORY_EMPTY_MESSAGE,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  toPreviewLine,
} from "../src/ui/history-format.js";
import { createMarkerTheme, createPlainTheme } from "./helpers.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

const PLAIN = createPlainTheme();
const MARKED = createMarkerTheme();
const TIME = { locale: "en-US", timeZone: "UTC" } as const;

// 2024-05-17T08:09:10Z.
const FIRST = 1_715_933_350_000;

describe("severity presentation", () => {
  it("maps each severity to its theme color", () => {
    expect(SEVERITY_COLORS).toEqual({
      error: "error",
      info: "accent",
      warning: "warning",
    });
  });

  it("uses fixed-width labels so rows align", () => {
    expect(SEVERITY_LABELS).toEqual({
      error: "ERROR",
      info: "INFO",
      warning: "WARN",
    });
  });
});

describe("toPreviewLine", () => {
  it("collapses newlines and whitespace runs into single spaces", () => {
    expect(toPreviewLine("  first\n\tsecond\n\n  third  ")).toBe(
      "first second third",
    );
  });
});

describe("formatHistoryRow", () => {
  it("shows time, severity, and a one-line preview", () => {
    const row = formatHistoryRow(
      createNotificationEntry("a message", "warning", FIRST),
      PLAIN,
      60,
      TIME,
    );

    expect(row).toBe(
      `08:09 WARN  a message${" ".repeat(60 - "08:09 WARN  a message".length)}`,
    );
  });

  it("colors the severity label and dims the time", () => {
    const row = formatHistoryRow(
      createNotificationEntry("boom", "error", FIRST),
      MARKED,
      60,
      TIME,
    );

    expect(row).toContain("<dim>08:09</dim>");
    expect(row).toContain("<error><b>ERROR</b></error>");
  });

  it("colors info and warning distinctly", () => {
    const info = formatHistoryRow(
      createNotificationEntry("m", "info", FIRST),
      MARKED,
      60,
      TIME,
    );
    const warning = formatHistoryRow(
      createNotificationEntry("m", "warning", FIRST),
      MARKED,
      60,
      TIME,
    );

    expect(info).toContain("<accent><b>INFO </b></accent>");
    expect(warning).toContain("<warning><b>WARN </b></warning>");
  });

  it("fills the whole row width so a highlight spans the pane", () => {
    const row = formatHistoryRow(
      createNotificationEntry("short", "info", FIRST),
      PLAIN,
      48,
      TIME,
    );

    expect(visibleWidth(row)).toBe(48);
  });

  it("applies the selection background around the styled row", () => {
    const row = formatHistoryRow(
      createNotificationEntry("m", "info", FIRST),
      MARKED,
      60,
      { ...TIME, selected: true },
    );

    expect(row.startsWith("<bg:selectedBg>")).toBe(true);
    expect(row.endsWith("</bg>")).toBe(true);
    expect(row).toContain("<accent>");
  });

  it("leaves an unselected row without a background", () => {
    const row = formatHistoryRow(
      createNotificationEntry("m", "info", FIRST),
      MARKED,
      60,
      TIME,
    );

    expect(row).not.toContain("<bg:");
  });

  it("keeps the highlight across a truncation reset", () => {
    // The TUI's truncation helper emits a full SGR reset around its
    // ellipsis, which would otherwise clear the background mid-row.
    const row = formatHistoryRow(
      createNotificationEntry("x".repeat(500), "info", FIRST),
      MARKED,
      40,
      { ...TIME, selected: true },
    );
    const resets = row.split("\u001B[0m");

    for (const segment of resets.slice(1)) {
      expect(segment.startsWith("<bg:selectedBg>")).toBe(true);
    }
  });

  it("truncates an over-long preview to the row width", () => {
    const row = formatHistoryRow(
      createNotificationEntry("x".repeat(500), "info", FIRST),
      PLAIN,
      40,
      TIME,
    );

    expect(visibleWidth(row)).toBe(40);
    expect(row).toContain("…");
  });

  it("collapses a multiline message onto one row", () => {
    const row = formatHistoryRow(
      createNotificationEntry("one\ntwo\nthree", "info", FIRST),
      PLAIN,
      60,
      TIME,
    );

    expect(row).toContain("one two three");
    expect(row.includes("\n")).toBe(false);
  });
});

describe("formatHistoryDetail", () => {
  it("shows full date, time, severity, and the complete message", () => {
    const lines = formatHistoryDetail(
      createNotificationEntry("the whole message", "warning", FIRST),
      PLAIN,
      40,
      TIME,
    );

    expect(lines[0]).toBe("May 17, 2024, 8:09:10 AM");
    expect(lines[1]).toBe("WARN");
    expect(lines[2]).toBe("");
    expect(lines[3]).toBe("the whole message");
  });

  it("colors the severity heading", () => {
    const lines = formatHistoryDetail(
      createNotificationEntry("m", "error", FIRST),
      MARKED,
      40,
      TIME,
    );

    expect(lines[1]).toBe("<error><b>ERROR</b></error>");
  });

  it("wraps instead of truncating, keeping the complete message", () => {
    const message = `${"word ".repeat(40)}end`;
    const lines = formatHistoryDetail(
      createNotificationEntry(message, "info", FIRST),
      PLAIN,
      30,
      TIME,
    );

    expect(lines.join(" ")).toContain("end");
    expect(lines.join(" ")).not.toContain("…");

    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(30);
    }
  });

  it("preserves the blank-line structure of a multiline message", () => {
    const lines = formatHistoryDetail(
      createNotificationEntry("one\n\nthree", "info", FIRST),
      PLAIN,
      40,
      TIME,
    );

    expect(lines.slice(3)).toEqual(["one", "", "three"]);
  });
});

describe("HISTORY_EMPTY_MESSAGE", () => {
  it("is a complete sentence", () => {
    expect(HISTORY_EMPTY_MESSAGE.endsWith(".")).toBe(true);
  });
});
