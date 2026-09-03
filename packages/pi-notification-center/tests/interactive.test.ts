import { isInteractiveTui } from "../src/interactive.js";
import { describe, expect, it } from "vitest";

describe("isInteractiveTui", () => {
  it("is true only in the interactive TUI", () => {
    expect(isInteractiveTui({ mode: "tui" })).toBe(true);
  });

  it("is false in every non-TUI run mode", () => {
    for (const mode of ["rpc", "json", "print"] as const) {
      expect(isInteractiveTui({ mode })).toBe(false);
    }
  });
});
