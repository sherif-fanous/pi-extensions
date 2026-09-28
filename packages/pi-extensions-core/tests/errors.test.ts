import { describeError, describeErrorSentence } from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("describeError", () => {
  it("returns the message of an Error", () => {
    expect(describeError(new Error("disk full"))).toBe("disk full");
  });

  it("returns the message of an Error subclass", () => {
    expect(describeError(new TypeError("not a function"))).toBe(
      "not a function",
    );
  });

  it("converts a thrown string to itself", () => {
    expect(describeError("plain failure")).toBe("plain failure");
  });

  it("converts other thrown values with String()", () => {
    expect(describeError(42)).toBe("42");
    expect(describeError(undefined)).toBe("undefined");
    expect(describeError(null)).toBe("null");
  });

  it("leaves punctuation to the caller", () => {
    expect(describeError(new Error("disk full."))).toBe("disk full.");
    expect(describeError(new Error("disk full"))).not.toMatch(/\.$/u);
  });
});

describe("describeErrorSentence", () => {
  it.each([
    ["disk full", "disk full."],
    ["Disk full.", "Disk full."],
    ["Disk full!", "Disk full!"],
    ["Disk full?", "Disk full?"],
  ])("ends %j with exactly one terminator", (message, expected) => {
    expect(describeErrorSentence(new Error(message))).toBe(expected);
  });

  it("reads Unknown error. for an empty message", () => {
    expect(describeErrorSentence(new Error("  "))).toBe("Unknown error.");
  });

  it("reads Unknown error. when the value can't be converted to text", () => {
    const unprintable = {
      toString(): string {
        throw new Error("no text");
      },
    };

    expect(describeErrorSentence(unprintable)).toBe("Unknown error.");
  });
});
