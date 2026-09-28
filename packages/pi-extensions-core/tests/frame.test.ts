import {
  frameBodyRows,
  frameBodyWidth,
  frameLine,
  frameSegment,
  frameTop,
  padToWidth,
  renderFrame,
} from "../src/index.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  createMarkerTheme,
  createPlainTheme,
  findOverflowingLines,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

const plain = createPlainTheme();
const marker = createMarkerTheme();

describe("padToWidth", () => {
  it("pads short text and truncates long text with an ellipsis", () => {
    expect(padToWidth("ab", 4)).toBe("ab  ");
    expect(stripAnsi(padToWidth("abcdef", 4))).toBe("abc…");
  });

  it("measures wide characters and styled text in visual columns", () => {
    expect(visibleWidth(padToWidth("日本", 5))).toBe(5);
    expect(visibleWidth(padToWidth("\u001B[31mab\u001B[0m", 6))).toBe(6);
  });

  it("uses the fill and ellipsis it is given", () => {
    expect(padToWidth("ab", 4, "─")).toBe("ab──");
    expect(stripAnsi(padToWidth("abcdef", 4, " ", "─"))).toBe("abc─");
  });

  it("returns an empty string for a width of zero or less", () => {
    expect(padToWidth("ab", 0)).toBe("");
    expect(padToWidth("ab", -3)).toBe("");
  });
});

describe("frameLine", () => {
  it("fits content between two borders", () => {
    expect(frameLine("ab", 6, plain)).toBe("│ab  │");
    expect(stripAnsi(frameLine("abcdef", 6, plain))).toBe("│abc…│");
  });

  it("draws the borders in the theme's border color", () => {
    expect(frameLine("ab", 4, marker)).toBe(
      "<border>│</border>ab<border>│</border>",
    );
  });

  it("degrades to the columns it has", () => {
    expect(frameLine("ab", 0, plain)).toBe("");
    expect(frameLine("ab", 1, plain)).toBe("│");
    expect(frameLine("ab", 2, plain)).toBe("││");
  });
});

describe("frameSegment", () => {
  it("fills between the corners in the border color", () => {
    expect(frameSegment("┌", "┐", 5, plain)).toBe("┌───┐");
    expect(frameSegment("├", "┤", 3, marker)).toBe("<border>├─┤</border>");
  });

  it("degrades to the columns it has", () => {
    expect(frameSegment("┌", "┐", 0, plain)).toBe("");
    expect(frameSegment("┌", "┐", 1, plain)).toBe("┌");
    expect(frameSegment("┌", "┐", 2, plain)).toBe("┌┐");
  });
});

describe("frameTop", () => {
  it("puts the title in the top border in bold accent", () => {
    expect(frameTop("Title", 14, plain)).toBe("┌─ Title ────┐");
    expect(frameTop("Title", 14, marker)).toBe(
      "<border>┌─ </border><accent><b>Title</b></accent> <border>────</border><border>┐</border>",
    );
  });

  it("puts titleRight at the right end of the border", () => {
    expect(frameTop("Title", 22, plain, "(3/12)")).toBe(
      "┌─ Title ─── (3/12) ─┐",
    );
  });

  it("drops titleRight before truncating the title", () => {
    expect(frameTop("Title", 16, plain, "(3/12)")).toBe("┌─ Title ──────┐");
    expect(stripAnsi(frameTop("Long title", 10, plain, "(3/12)"))).toBe(
      "┌─ Long… ┐",
    );
  });

  it("draws a plain border when no title fits", () => {
    expect(frameTop("Title", 4, plain)).toBe("┌──┐");
  });

  it("is exactly the width at every width", () => {
    for (let width = 0; width <= 30; width += 1) {
      expect(visibleWidth(frameTop("Title", width, plain, "(3/12)"))).toBe(
        width,
      );
    }
  });
});

describe("frameBodyWidth and frameBodyRows", () => {
  it("leave out the borders and padding", () => {
    expect(frameBodyWidth(40)).toBe(36);
    expect(frameBodyWidth(3)).toBe(0);
  });

  it("leave out the top, rule, bottom, and footer rows", () => {
    expect(frameBodyRows(20, 2)).toBe(15);
    expect(frameBodyRows(20, 0)).toBe(18);
    expect(frameBodyRows(3, 2)).toBe(0);
  });
});

describe("renderFrame", () => {
  const options = {
    body: ["First row", "Second row"],
    footer: ["↑/↓ Move · Enter Select", "Esc Close"],
    theme: plain,
    title: "Presets Plus",
  };

  it("draws the title border, padded body, rule, footer, and bottom", () => {
    expect(renderFrame({ ...options, width: 30 })).toEqual([
      "┌─ Presets Plus ─────────────┐",
      "│ First row                  │",
      "│ Second row                 │",
      "├────────────────────────────┤",
      "│ ↑/↓ Move · Enter Select    │",
      "│ Esc Close                  │",
      "└────────────────────────────┘",
    ]);
  });

  it("dims the footer", () => {
    const lines = renderFrame({ ...options, theme: marker, width: 40 });

    expect(lines[4]).toContain("<dim>↑/↓ Move · Enter Select</dim>");
  });

  it("draws no rule without a footer", () => {
    expect(renderFrame({ ...options, footer: [], width: 20 })).toEqual([
      "┌─ Presets Plus ───┐",
      "│ First row        │",
      "│ Second row       │",
      "└──────────────────┘",
    ]);
  });

  it("returns as many lines as frameBodyRows budgets for", () => {
    const body = Array.from({ length: frameBodyRows(12, 2) }, () => "row");

    expect(renderFrame({ ...options, body, width: 30 })).toHaveLength(12);
  });

  it("fits every line to narrow widths", () => {
    const body = ["A body row much wider than the frame it sits in", "日本語"];

    for (const width of [40, 20, 8, 3, 1]) {
      const lines = renderFrame({ ...options, body, width });

      expect(findOverflowingLines(lines, width)).toEqual([]);
      expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
    }
  });

  it("returns nothing for a width of zero", () => {
    expect(renderFrame({ ...options, width: 0 })).toEqual([]);
  });
});
