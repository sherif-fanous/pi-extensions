/**
 * Covers the terminal frame helpers: padding and truncating to a visible
 * width, drawing borders and segments, centering, wrapping body text while
 * ANSI styling and wide characters stay intact, wrapping footer key hints,
 * and scrolling a body inside an overlay height.
 */
import {
  centerText,
  frameLine,
  frameSegment,
  padToWidth,
  resolveOverlayHeight,
  scrollBody,
  scrollOffsetShowing,
  wrapBody,
  wrapKeyHints,
} from "../../src/ui/frame.js";
import { stripAnsi } from "../helpers/ansi.js";
import { describe, expect, it } from "vitest";

describe("frame helpers", () => {
  it("pads content to the requested visible width", () => {
    expect(padToWidth("abc", 5)).toBe("abc  ");
  });

  it("truncates content with configurable ellipsis", () => {
    expect(stripAnsi(padToWidth("abcdef", 4))).toBe("abc…");
    expect(stripAnsi(padToWidth("abcdef", 4, "─", "─"))).toBe("abc─");
  });

  it("frames content with side borders", () => {
    expect(frameLine("x", 5)).toBe("│x  │");
  });

  it("renders fixed border segments", () => {
    expect(frameSegment("┌", "─", "┐", 5)).toBe("┌───┐");
  });

  it("centers text inside a visual width", () => {
    expect(centerText("x", 5)).toBe("  x  ");
    expect(centerText("xx", 5)).toBe(" xx  ");
  });

  it("wraps body lines without redundant inner padding", () => {
    expect(wrapBody("alpha beta gamma", 10)).toEqual(["alpha beta", "gamma"]);
  });

  it("wraps a long unbroken body value", () => {
    expect(wrapBody("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("wraps body lines by visible width", () => {
    expect(wrapBody("東京大阪", 4)).toEqual(["東京", "大阪"]);
  });

  it("preserves body styling across wrapped lines", () => {
    const lines = wrapBody("\u001B[31malpha beta\u001B[0m", 5);

    expect(lines.map(stripAnsi)).toEqual(["alpha", "beta"]);
    expect(lines.every((line) => line.includes("\u001B[31m"))).toBe(true);
  });
});

describe("wrapKeyHints", () => {
  it("keeps hints on one line when they fit", () => {
    expect(wrapKeyHints(["Enter Save", "Esc Cancel"], 30)).toEqual([
      " Enter Save · Esc Cancel",
    ]);
  });

  it("breaks only between hints when the line is too narrow", () => {
    expect(wrapKeyHints(["Enter Save", "Esc Cancel", "F1 Help"], 21)).toEqual([
      " Enter Save",
      " Esc Cancel · F1 Help",
    ]);
  });

  it("truncates only a single hint wider than the line", () => {
    expect(
      wrapKeyHints(["Enter Activate the preset"], 10).map(stripAnsi),
    ).toEqual([" Enter Ac…"]);
  });
});

describe("scrollBody", () => {
  const lines = ["a", "b", "c", "d", "e"];
  const marker = (text: string) => text;

  it("returns every line unmarked when they fit", () => {
    expect(scrollBody(lines, 5, 0, 4, marker)).toEqual({
      lines,
      scrollOffset: 0,
    });
  });

  it("marks hidden lines below and above", () => {
    expect(scrollBody(lines, 2, 0, 4, marker).lines).toEqual(["a", "b  ↓"]);
    expect(scrollBody(lines, 2, 3, 4, marker).lines).toEqual(["d  ↑", "e"]);
    expect(scrollBody(lines, 3, 1, 4, marker).lines).toEqual([
      "b  ↑",
      "c",
      "d  ↓",
    ]);
  });

  it("clamps the offset to the last full window", () => {
    expect(scrollBody(lines, 2, 99, 4, marker).scrollOffset).toBe(3);
  });
});

describe("scrollOffsetShowing", () => {
  it("keeps the offset while the range is visible", () => {
    expect(scrollOffsetShowing(2, 4, 3, 5)).toBe(2);
  });

  it("scrolls up or down just enough to show the range", () => {
    expect(scrollOffsetShowing(4, 4, 1, 2)).toBe(1);
    expect(scrollOffsetShowing(0, 4, 5, 7)).toBe(3);
  });

  it("shows the start of a range taller than the window", () => {
    expect(scrollOffsetShowing(0, 2, 3, 8)).toBe(3);
  });
});

describe("resolveOverlayHeight", () => {
  it("takes the percentage of the terminal height, within the margins", () => {
    expect(resolveOverlayHeight(40, 90, 2)).toBe(36);
    expect(resolveOverlayHeight(20, 90, 2)).toBe(16);
    expect(resolveOverlayHeight(1, 50, 2)).toBe(1);
  });
});
