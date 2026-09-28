import {
  emptyStateLines,
  listPosition,
  listWindow,
  moveListSelection,
  scrollLines,
} from "../../src/index.js";
import {
  createMarkerTheme,
  createPlainTheme,
  findOverflowingLines,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

const plain = createPlainTheme();

describe("moveListSelection", () => {
  it("moves one item with up and down, wrapping around the ends", () => {
    expect(moveListSelection(2, 5, "down", 3)).toBe(3);
    expect(moveListSelection(4, 5, "down", 3)).toBe(0);
    expect(moveListSelection(2, 5, "up", 3)).toBe(1);
    expect(moveListSelection(0, 5, "up", 3)).toBe(4);
  });

  it("moves one page with page keys and stops at the ends", () => {
    expect(moveListSelection(1, 10, "pageDown", 3)).toBe(4);
    expect(moveListSelection(8, 10, "pageDown", 3)).toBe(9);
    expect(moveListSelection(9, 10, "pageDown", 3)).toBe(9);
    expect(moveListSelection(5, 10, "pageUp", 3)).toBe(2);
    expect(moveListSelection(1, 10, "pageUp", 3)).toBe(0);
  });

  it("moves at least one item per page", () => {
    expect(moveListSelection(1, 10, "pageDown", 0)).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(moveListSelection(0, 0, "down", 3)).toBe(0);
  });
});

describe("listWindow", () => {
  it("shows every item and no position when the list fits", () => {
    expect(listWindow(1, 3, 5)).toEqual({
      end: 3,
      position: undefined,
      start: 0,
    });
  });

  it("keeps the selection centered and shows its position", () => {
    expect(listWindow(6, 12, 5)).toEqual({
      end: 9,
      position: "(7/12)",
      start: 4,
    });
  });

  it("stops the window at either end", () => {
    expect(listWindow(0, 12, 5)).toMatchObject({ end: 5, start: 0 });
    expect(listWindow(11, 12, 5)).toMatchObject({ end: 12, start: 7 });
  });

  it("is empty for an empty list", () => {
    expect(listWindow(0, 0, 5)).toEqual({
      end: 0,
      position: undefined,
      start: 0,
    });
  });
});

describe("listPosition", () => {
  it("writes the 1-based position in parentheses", () => {
    expect(listPosition(2, 12)).toBe("(3/12)");
  });
});

describe("scrollLines", () => {
  const lines = ["one", "two", "three", "four", "five"];

  it("returns the lines unmarked when they fit", () => {
    expect(scrollLines(lines, 5, 0, 10, plain)).toEqual({ lines, offset: 0 });
  });

  it("marks the edges that have hidden lines beyond them", () => {
    expect(scrollLines(lines, 3, 1, 8, plain)).toEqual({
      lines: ["two    ↑", "three", "four   ↓"],
      offset: 1,
    });
    expect(scrollLines(lines, 2, 0, 6, plain).lines).toEqual(["one", "two  ↓"]);
    expect(scrollLines(lines, 2, 3, 6, plain).lines).toEqual([
      "four ↑",
      "five",
    ]);
  });

  it("marks a lone row with both directions", () => {
    expect(scrollLines(lines, 1, 2, 7, plain).lines).toEqual(["three ↕"]);
  });

  it("clamps the offset into range", () => {
    expect(scrollLines(lines, 2, 9, 6, plain).offset).toBe(3);
    expect(scrollLines(lines, 2, -4, 6, plain).offset).toBe(0);
  });

  it("draws the markers dim", () => {
    expect(scrollLines(lines, 2, 0, 6, createMarkerTheme()).lines[1]).toBe(
      "two  <dim>↓</dim>",
    );
  });

  it("fits every row to the width", () => {
    const wide = ["a row much wider than the width", "b", "c"];

    expect(
      findOverflowingLines(scrollLines(wide, 2, 0, 10, plain).lines, 10),
    ).toEqual([]);
  });
});

describe("emptyStateLines", () => {
  it("wraps the message in the muted color", () => {
    expect(emptyStateLines("No presets yet.", 40, createMarkerTheme())).toEqual(
      ["<muted>No presets yet.</muted>"],
    );
  });

  it("fits a long message to narrow widths", () => {
    const message = "No presets yet. Press n to create one.";

    for (const width of [40, 20, 10]) {
      expect(
        findOverflowingLines(emptyStateLines(message, width, plain), width),
      ).toEqual([]);
    }
  });
});
