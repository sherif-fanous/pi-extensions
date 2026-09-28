import { pluralize } from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("pluralize", () => {
  it.each([
    [0, "0 presets"],
    [1, "1 preset"],
    [2, "2 presets"],
  ])("writes %d with the matching regular form", (count, expected) => {
    expect(pluralize(count, "preset")).toBe(expected);
  });

  it("uses the given plural for an irregular noun", () => {
    expect(pluralize(1, "entry", "entries")).toBe("1 entry");
    expect(pluralize(3, "entry", "entries")).toBe("3 entries");
  });
});
