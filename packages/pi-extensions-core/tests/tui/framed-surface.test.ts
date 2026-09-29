/**
 * Covers the framed, scrollable surface: the footer it picks for a body
 * that fits or overflows, the busy line, fitting the overlay height,
 * scrolling and clamping the offset, pinned rows, keeping a range in
 * view, and fitting every line at narrow widths.
 */
import {
  layoutFramedSurface,
  overlayMaxHeight,
  type FramedSurfaceOptions,
} from "../../src/index.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  createMarkerTheme,
  createPlainTheme,
  findOverflowingLines,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

const CLOSE = "Enter/Esc Close";
const LONG_BODY = Array.from({ length: 40 }, (_, index) => `line ${index}`);

/** Body rows between the top border and the rule, without borders. */
function bodyOf(lines: readonly string[]): string[] {
  const rule = lines.findIndex((line) => stripAnsi(line).startsWith("├"));

  return lines.slice(1, rule).map((line) => stripAnsi(line).slice(2, -2));
}

/** Footer rows between the rule and the bottom border, trimmed. */
function footerOf(lines: readonly string[]): string[] {
  const rule = lines.findIndex((line) => stripAnsi(line).startsWith("├"));

  return lines
    .slice(rule + 1, -1)
    .map((line) => stripAnsi(line).slice(2, -2).trimEnd());
}

/** A surface on a 20-row terminal, whose overlay is 16 rows tall. */
function layout(overrides: Partial<FramedSurfaceOptions> = {}) {
  return layoutFramedSurface({
    body: LONG_BODY,
    hints: [CLOSE],
    overflowHints: ["↑/↓ Scroll", "PgUp/PgDn Page", CLOSE],
    scrollOffset: 0,
    terminalRows: 20,
    theme: createPlainTheme(),
    title: "Title",
    width: 48,
    ...overrides,
  });
}

describe("layoutFramedSurface", () => {
  it("frames a body that fits with the hints in the footer", () => {
    const surface = layout({ body: ["First row", "Second row"], width: 30 });

    expect(surface.lines).toEqual([
      "┌─ Title ────────────────────┐",
      "│ First row                  │",
      "│ Second row                 │",
      "├────────────────────────────┤",
      "│ Enter/Esc Close            │",
      "└────────────────────────────┘",
    ]);
    expect(surface.scrollOffset).toBe(0);
    // 16 rows, less the top, rule, footer, and bottom.
    expect(surface.bodyRows).toBe(12);
  });

  it("switches to the overflow hints and fits the overlay height when the body is taller", () => {
    const surface = layout();

    // The overflow hints wrap to two lines, which takes a body row away.
    expect(surface.lines).toHaveLength(overlayMaxHeight(20));
    expect(footerOf(surface.lines)).toEqual([
      "↑/↓ Scroll · PgUp/PgDn Page",
      CLOSE,
    ]);
    expect(surface.bodyRows).toBe(11);
    expect(bodyOf(surface.lines)[0]).toMatch(/^line 0 +$/);
    expect(bodyOf(surface.lines).at(-1)).toMatch(/^line 10 +↓$/);
    expect(stripAnsi(surface.lines.at(-1) ?? "")).toMatch(/^└─+┘$/);
  });

  it("keeps the hints when no overflow hints are given", () => {
    expect(footerOf(layout({ overflowHints: undefined }).lines)).toEqual([
      CLOSE,
    ]);
  });

  it("scrolls from the offset and clamps it at the end of the body", () => {
    const middle = layout({ scrollOffset: 5 });

    expect(middle.scrollOffset).toBe(5);
    expect(bodyOf(middle.lines)[0]).toMatch(/^line 5 +↑$/);
    expect(bodyOf(middle.lines).at(-1)).toMatch(/^line 15 +↓$/);

    const end = layout({ scrollOffset: 100 });

    expect(end.scrollOffset).toBe(29);
    expect(bodyOf(end.lines)[0]).toMatch(/^line 29 +↑$/);
    expect(bodyOf(end.lines).at(-1)).toMatch(/^line 39 +$/);
  });

  it("shows a dim busy line in place of any hints", () => {
    const surface = layout({ busy: "Saving…" });
    const marked = layout({ busy: "Saving…", theme: createMarkerTheme() });

    expect(footerOf(surface.lines)).toEqual(["Saving…"]);
    expect(surface.bodyRows).toBe(12);
    expect(marked.lines.at(-2)).toContain("<dim>Saving…</dim>");
  });

  it("draws pinned rows under the scrolled body, never scrolled", () => {
    const pinned = ["", "● Yes   ○ No"];
    const top = layout({ pinned });
    const scrolled = layout({ pinned, scrollOffset: 10 });

    expect(top.lines).toHaveLength(overlayMaxHeight(20));
    expect(top.bodyRows).toBe(9);
    expect(bodyOf(top.lines).slice(-3)).toEqual([
      `line 8${" ".repeat(37)}↓`,
      " ".repeat(44),
      `● Yes   ○ No${" ".repeat(32)}`,
    ]);

    expect(bodyOf(scrolled.lines).slice(-2)).toEqual(
      bodyOf(top.lines).slice(-2),
    );
  });

  it("keeps at least one body row above the pinned rows", () => {
    const surface = layout({ pinned: ["", "● Yes   ○ No"], terminalRows: 8 });

    expect(surface.bodyRows).toBe(1);
    expect(bodyOf(surface.lines)[0]).toMatch(/^line 0 +↓$/);
  });

  describe("reveal", () => {
    // A 10-row terminal leaves four body rows under a one-line footer.
    const reveal = (
      scrollOffset: number,
      range: { end: number; start: number },
      pinned: string[] = [],
    ): number =>
      layout({
        body: LONG_BODY.slice(0, 10),
        overflowHints: undefined,
        pinned,
        reveal: range,
        scrollOffset,
        terminalRows: 10,
      }).scrollOffset;

    it("keeps the offset while the range is in view", () => {
      expect(reveal(2, { end: 5, start: 3 })).toBe(2);
    });

    it("scrolls up or down just enough to show the range", () => {
      expect(reveal(4, { end: 2, start: 1 })).toBe(1);
      expect(reveal(0, { end: 7, start: 5 })).toBe(3);
    });

    it("shows the start of a range taller than the rows", () => {
      expect(reveal(0, { end: 8, start: 3 }, ["", "Buttons"])).toBe(3);
    });
  });

  it("passes titleRight to the top border", () => {
    expect(layout({ titleRight: "(3/12)" }).lines[0]).toMatch(
      /^┌─ Title ─+ \(3\/12\) ─┐$/,
    );
  });

  it.each([40, 30, 20, 8, 3, 1])("fits every line at width %i", (width) => {
    const surface = layout({
      body: ["A body row much wider than the frame it sits in", "日本語"],
      busy: undefined,
      pinned: ["● Override   ○ Cancel"],
      title: "A Title Too Long For This Narrow Surface",
      width,
    });

    expect(findOverflowingLines(surface.lines, width)).toEqual([]);
    expect(surface.lines.every((line) => visibleWidth(line) === width)).toBe(
      true,
    );
  });
});
