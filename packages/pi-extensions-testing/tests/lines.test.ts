import { findOverflowingLines } from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("findOverflowingLines", () => {
  it("returns nothing when every line fits the width", () => {
    expect(findOverflowingLines(["abcd", "ab", ""], 4)).toEqual([]);
  });

  it("reports each wider line with its index and visual width", () => {
    expect(findOverflowingLines(["abcd", "abcde", "ok", "日本語"], 4)).toEqual([
      { index: 1, line: "abcde", width: 5 },
      { index: 3, line: "日本語", width: 6 },
    ]);
  });

  it("ignores styling escapes when measuring", () => {
    expect(findOverflowingLines(["\u001B[31mabcd\u001B[0m"], 4)).toEqual([]);
  });
});
