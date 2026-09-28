import { overlayMaxHeight, overlayOptions } from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("overlayOptions", () => {
  it("opens a main surface centered at 80% wide and high", () => {
    expect(overlayOptions("main")).toEqual({
      anchor: "center",
      margin: 1,
      maxHeight: "80%",
      minWidth: 60,
      width: "80%",
    });
  });

  it("opens a nested dialog centered at 50% wide and 80% high", () => {
    expect(overlayOptions("nested")).toEqual({
      anchor: "center",
      margin: 1,
      maxHeight: "80%",
      minWidth: 48,
      width: "50%",
    });
  });
});

describe("overlayMaxHeight", () => {
  it("resolves 80% of the terminal height, rounded down", () => {
    expect(overlayMaxHeight(40)).toBe(32);
    expect(overlayMaxHeight(25)).toBe(20);
  });

  it("stays inside the margins and is at least one row", () => {
    expect(overlayMaxHeight(3)).toBe(1);
    expect(overlayMaxHeight(1)).toBe(1);
  });
});
