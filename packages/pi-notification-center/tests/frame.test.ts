import {
  frameLine,
  frameSegment,
  padToWidth,
  renderSplitFrame,
  SPLIT_FRAME_CHROME_COLUMNS,
  SPLIT_FRAME_CHROME_ROWS,
  splitPaneWidths,
  type SplitPanes,
} from "../src/ui/frame.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

// Two columns each, so a string of them measures differently than it
// counts.
const WIDE = "日本語";
// Red text. The escape sequences occupy no columns at all.
const STYLED = "\u001B[31mabcdefgh\u001B[0m";

describe("padToWidth", () => {
  it("pads plain text to exactly the requested columns", () => {
    expect(padToWidth("ab", 6)).toBe("ab    ");
  });

  it("pads with the requested fill character", () => {
    expect(padToWidth("ab", 6, "-")).toBe("ab----");
  });

  it("pads an empty string to the full width", () => {
    expect(padToWidth("", 4)).toBe("    ");
  });

  it("measures a wide character as the two columns it occupies", () => {
    expect(visibleWidth(padToWidth("日本", 6))).toBe(6);
    expect(padToWidth("日本", 6)).toBe("日本  ");
  });

  it("pads to an odd width around a wide character", () => {
    expect(visibleWidth(padToWidth("日本", 5))).toBe(5);
  });

  it("ignores escape sequences when measuring styled text", () => {
    expect(visibleWidth(padToWidth("\u001B[31mab\u001B[0m", 6))).toBe(6);
  });

  it("truncates plain text to exactly the requested columns", () => {
    expect(visibleWidth(padToWidth("abcdefgh", 4))).toBe(4);
  });

  it("truncates wide characters to exactly the requested columns", () => {
    expect(visibleWidth(padToWidth(WIDE, 4))).toBe(4);
    expect(visibleWidth(padToWidth(WIDE, 5))).toBe(5);
  });

  it("truncates styled text to exactly the requested columns", () => {
    expect(visibleWidth(padToWidth(STYLED, 4))).toBe(4);
  });

  it("leaves text that already fits untouched", () => {
    expect(padToWidth("abcd", 4)).toBe("abcd");
  });

  // The library marks a truncation with three dots by default, which
  // would cost two columns more than callers here budget for. Widening
  // this mark silently over-runs every row that relies on it.
  it("marks a truncation with a single-column ellipsis", () => {
    const truncated = padToWidth("abcdefgh", 4);

    expect(truncated).toContain("…");
    expect(truncated).not.toContain("...");
  });
});

describe("frameLine", () => {
  it("wraps content in borders and pads to exactly the requested columns", () => {
    expect(frameLine(" hi ", 10)).toBe("│ hi     │");
  });

  it("keeps its width with a wide character inside", () => {
    const line = frameLine(" 日本 ", 10);

    expect(visibleWidth(line)).toBe(10);
    expect(line.startsWith("│")).toBe(true);
    expect(line.endsWith("│")).toBe(true);
  });

  it("keeps its width with styled content inside", () => {
    const line = frameLine(" \u001B[31mhi\u001B[0m ", 10);

    expect(visibleWidth(line)).toBe(10);
    expect(line.startsWith("│")).toBe(true);
    expect(line.endsWith("│")).toBe(true);
  });

  it("truncates content too wide to fit between the borders", () => {
    expect(visibleWidth(frameLine("abcdefghijklmno", 10))).toBe(10);
  });

  // Two columns is the documented minimum, and it leaves room for the
  // borders alone.
  it("draws only the borders at the minimum width", () => {
    expect(frameLine("x", 2)).toBe("││");
  });
});

describe("frameSegment", () => {
  it("draws the given ends across exactly the requested columns", () => {
    expect(frameSegment("┌", "┐", 8)).toBe("┌──────┐");
  });

  it("varies the ends independently of the width", () => {
    expect(frameSegment("├", "┤", 4)).toBe("├──┤");
  });

  it("draws only the ends at the minimum width", () => {
    expect(frameSegment("└", "┘", 2)).toBe("└┘");
  });
});

describe("splitPaneWidths", () => {
  // The chrome is two outer borders, a space of padding on each side of
  // each pane, and the divider. Stated as a literal here on purpose: a
  // test written in terms of the constant would follow the constant
  // wherever it moved and pin nothing.
  it("spends the width on two panes plus seven columns of chrome", () => {
    expect(splitPaneWidths(29, 6)).toEqual({ left: 11, right: 11, width: 29 });
    expect(SPLIT_FRAME_CHROME_COLUMNS).toBe(7);
  });

  it("leaves no column unspent at any width", () => {
    for (let width = 19; width < 200; width += 1) {
      const panes = panesFor(width);

      expect(panes.left + panes.right + SPLIT_FRAME_CHROME_COLUMNS).toBe(width);
    }
  });

  it("reports no layout when two minimum panes do not fit", () => {
    expect(splitPaneWidths(6 * 2 + 7 - 1, 6)).toBeUndefined();
  });

  it("yields two minimum panes at exactly the minimum width", () => {
    expect(splitPaneWidths(6 * 2 + 7, 6)).toEqual({
      left: 6,
      right: 6,
      width: 19,
    });
  });

  // Raising a too-narrow width to a minimum is how a frame comes to be
  // drawn wider than the space it was given.
  it("never reports a layout wider than the width it was given", () => {
    for (let width = 0; width < 40; width += 1) {
      const panes = splitPaneWidths(width, 6);

      if (panes) expect(panes.width).toBe(width);
    }
  });

  it("keeps both panes at or above the minimum whatever the fraction", () => {
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const panes = splitPaneWidths(29, 6, fraction);

      expect(panes?.left).toBeGreaterThanOrEqual(6);
      expect(panes?.right).toBeGreaterThanOrEqual(6);
    }
  });

  it("gives the left pane the requested share of the content", () => {
    expect(splitPaneWidths(107, 6, 0.25)?.left).toBe(25);
  });
});

describe("renderSplitFrame", () => {
  it("draws every line to the width the panes were derived from", () => {
    for (const width of [19, 29, 80, 121]) {
      for (const line of split({ panes: panesFor(width) })) {
        expect(visibleWidth(line)).toBe(width);
      }
    }
  });

  // The constant is what the caller budgets rows against, so it has to
  // agree with what this function actually emits.
  it("adds exactly the declared chrome rows to the content rows", () => {
    expect(SPLIT_FRAME_CHROME_ROWS).toBe(6);
    expect(split().length).toBe(3 + SPLIT_FRAME_CHROME_ROWS);
    expect(split({ rows: 7 }).length).toBe(7 + SPLIT_FRAME_CHROME_ROWS);
  });

  it("draws every line to the same width, so the borders stay straight", () => {
    const widths = new Set(split().map((line) => visibleWidth(line)));

    expect(widths.size).toBe(1);
  });

  // A pane holding fewer lines than the row count still has to reach the
  // bottom, or the divider between the panes would stop short.
  it("fills a short pane out to the full row count", () => {
    const lines = split();
    const lastContentRow = lines[5] ?? "";

    expect(visibleWidth(lastContentRow)).toBe(29);
    expect(lastContentRow.startsWith("│")).toBe(true);
    expect(lastContentRow.endsWith("│")).toBe(true);
  });

  it("pads pane content out to its own pane width", () => {
    expect(split()[3]).toBe("│ a           │ x           │");
  });

  it("truncates pane content wider than its own pane", () => {
    const lines = split({
      left: { lines: ["averylongleftline"], title: "L" },
      right: { lines: [WIDE + WIDE], title: "R" },
      rows: 1,
    });

    for (const line of lines) expect(visibleWidth(line)).toBe(29);
  });

  it("keeps its width when a pane title is wider than its pane", () => {
    const lines = split({
      left: { lines: ["a"], title: "a title far too long" },
      right: { lines: ["b"], title: "R" },
      rows: 1,
    });

    for (const line of lines) expect(visibleWidth(line)).toBe(29);
  });
});

/** Pane widths for `width`, failing loudly rather than skipping a case. */
function panesFor(width: number, minPaneWidth = 6): SplitPanes {
  const panes = splitPaneWidths(width, minPaneWidth);

  if (!panes) throw new Error(`no split layout at width ${String(width)}`);

  return panes;
}

/** Render a split frame, overriding only what a case cares about. */
function split(
  overrides: Partial<Parameters<typeof renderSplitFrame>[0]> = {},
): string[] {
  return renderSplitFrame({
    footer: "Esc Close",
    left: { lines: ["a", "b"], title: "L" },
    panes: panesFor(29),
    right: { lines: ["x"], title: "R" },
    rows: 3,
    title: "Notifications",
    ...overrides,
  });
}
