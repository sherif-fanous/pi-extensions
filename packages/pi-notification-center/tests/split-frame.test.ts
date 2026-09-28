import {
  renderSplitFrame,
  SPLIT_FRAME_CHROME_COLUMNS,
  splitFrameBodyRows,
  splitPaneWidths,
  type SplitPanes,
} from "../src/ui/split-frame.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  createMarkerTheme,
  createPlainTheme,
  findOverflowingLines,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

// Two columns each, so a string of them measures differently than it
// counts.
const WIDE = "日本語";

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

  it("fits every line at the narrowest width two panes allow", () => {
    const lines = split({
      footer: ["↑/↓ Move · Esc Close", "PgUp/PgDn Scroll Detail"],
      left: { lines: ["x".repeat(80)], title: "", titleRight: "(10/12)" },
      panes: panesFor(19),
      right: { lines: [WIDE.repeat(20)], title: "Detail 1-10/40" },
    });

    expect(findOverflowingLines(lines, 19)).toEqual([]);
  });

  // The caller sizes its rows with `splitFrameBodyRows`, so the two have
  // to agree on how many rows the chrome and the footer take.
  it("draws exactly the height its rows were sized for", () => {
    for (const footer of [[], ["one"], ["one", "two"]]) {
      for (const height of [8, 12, 30]) {
        const rows = splitFrameBodyRows(height, footer.length);

        expect(split({ footer, rows })).toHaveLength(height);
      }
    }
  });

  it("puts the title in the top border and the footer below a rule", () => {
    const lines = split();

    expect(lines[0]).toBe("┌─ Notifications ───────────┐");
    expect(lines.at(-3)).toBe("├─────────────┴─────────────┤");
    expect(lines.at(-2)).toBe("│ Esc Close                 │");
    expect(lines.at(-1)).toBe("└───────────────────────────┘");
  });

  it("draws every footer line, not only the first", () => {
    const lines = split({ footer: ["↑/↓ Move", "Esc Close"] });

    expect(lines.at(-3)).toContain("↑/↓ Move");
    expect(lines.at(-2)).toContain("Esc Close");
  });

  it("colors the borders, the title, and the footer by meaning", () => {
    const lines = split({ theme: createMarkerTheme() });

    expect(lines[0]).toContain("<accent><b>Notifications</b></accent>");
    expect(lines[0]).toContain("<border>");
    expect(lines[2]).toBe("<border>├─────────────┬─────────────┤</border>");
    expect(lines.at(-2)).toContain("<dim>Esc Close</dim>");
    expect(lines.at(-1)?.startsWith("<border>└")).toBe(true);
  });

  it("puts a pane's right title at the right edge of its header", () => {
    const lines = split({
      left: { lines: [], title: "", titleRight: "(2/9)" },
    });

    expect(lines[1]).toBe("│       (2/9) │ R           │");
  });

  it("lets the left title give way to the right one", () => {
    const lines = split({
      left: { lines: [], title: "a very long title", titleRight: "(2/9)" },
    });

    expect(stripAnsi(lines[1] ?? "")).toBe("│ a ve… (2/9) │ R           │");
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
    footer: ["Esc Close"],
    left: { lines: ["a", "b"], title: "L" },
    panes: panesFor(29),
    right: { lines: ["x"], title: "R" },
    rows: 3,
    theme: createPlainTheme(),
    title: "Notifications",
    ...overrides,
  });
}
