import { createNotificationEntry } from "../src/history.js";
import {
  formatDetailTitle,
  formatHistoryDetail,
  formatHistoryRow,
  HISTORY_EMPTY_MESSAGE,
  markDetailScroll,
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

  it("fills the row exactly when the locale formats the time in wide digits", () => {
    // Han decimal digits are one character each but occupy two columns, so
    // this row is a case where measuring the time by character count and
    // by display width disagree. The row must still fill its width exactly.
    for (const width of [20, 40, 60]) {
      const row = formatHistoryRow(
        createNotificationEntry("x".repeat(50), "warning", FIRST),
        PLAIN,
        width,
        { locale: "zh-Hans-CN-u-nu-hanidec", timeZone: "UTC" },
      );

      expect(visibleWidth(row)).toBe(width);
    }
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

  it("treats a carriage return and newline pair as one break", () => {
    const lines = formatHistoryDetail(
      createNotificationEntry("one\r\ntwo", "info", FIRST),
      PLAIN,
      40,
      TIME,
    );

    expect(lines.slice(3)).toEqual(["one", "two"]);
  });

  it("carries styling across a line break", () => {
    const lines = formatHistoryDetail(
      createNotificationEntry(
        "\u001b[31mred\nstill red\u001b[0m",
        "info",
        FIRST,
      ),
      PLAIN,
      40,
      TIME,
    );

    expect(lines.slice(3)).toHaveLength(2);
    expect(lines[4]).toContain("\u001b[31m");
  });
});

describe("formatDetailTitle", () => {
  it("stays bare when the whole message fits", () => {
    expect(formatDetailTitle(0, 10, 10)).toBe("Detail");
    expect(formatDetailTitle(0, 10, 4)).toBe("Detail");
  });

  it("reports the visible range when the message overflows", () => {
    expect(formatDetailTitle(0, 10, 40)).toBe("Detail 1-10/40");
    expect(formatDetailTitle(10, 10, 40)).toBe("Detail 11-20/40");
  });

  it("shows the end of the range once scrolled to the bottom", () => {
    expect(formatDetailTitle(35, 10, 40)).toBe("Detail 36-40/40");
  });
});

describe("markDetailScroll", () => {
  const BELOW = { above: false, below: true };
  const ABOVE = { above: true, below: false };
  const BOTH = { above: true, below: true };

  it("marks the last row when content follows", () => {
    const marked = markDetailScroll(["one", "two"], PLAIN, 10, BELOW);

    expect(marked[0]).toBe("one");
    expect(marked[1]).toBe("two      ↓");
    expect(visibleWidth(marked[1] ?? "")).toBe(10);
  });

  it("marks the first row when content sits above", () => {
    expect(markDetailScroll(["one", "two"], PLAIN, 10, ABOVE)).toEqual([
      "one      ↑",
      "two",
    ]);
  });

  it("marks both edges when the pane sits mid-message", () => {
    expect(markDetailScroll(["one", "two", "three"], PLAIN, 10, BOTH)).toEqual([
      "one      ↑",
      "two",
      "three    ↓",
    ]);
  });

  it("combines both directions on a one-row pane", () => {
    expect(markDetailScroll(["one"], PLAIN, 10, BOTH)).toEqual(["one      ↕"]);
  });

  it("keeps the pane width when the row is already full", () => {
    const marked = markDetailScroll(["0123456789"], PLAIN, 10, BELOW);

    expect(visibleWidth(marked[0] ?? "")).toBe(10);
    expect(marked[0]?.endsWith("↓")).toBe(true);
  });

  it("styles only the marker", () => {
    expect(markDetailScroll(["one"], MARKED, 6, BELOW)).toEqual([
      "one  <dim>↓</dim>",
    ]);
  });

  it("returns the rows untouched when there is nothing to mark", () => {
    expect(markDetailScroll([], PLAIN, 10, BOTH)).toEqual([]);
    expect(markDetailScroll(["one"], PLAIN, 1, BOTH)).toEqual(["one"]);
    expect(
      markDetailScroll(["one", "two"], PLAIN, 10, {
        above: false,
        below: false,
      }),
    ).toEqual(["one", "two"]);
  });
});

describe("HISTORY_EMPTY_MESSAGE", () => {
  it("is a complete sentence", () => {
    expect(HISTORY_EMPTY_MESSAGE.endsWith(".")).toBe(true);
  });
});
