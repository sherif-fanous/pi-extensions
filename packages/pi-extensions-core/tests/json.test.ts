import { parseJsonObject } from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("parseJsonObject", () => {
  it("returns the parsed object", () => {
    expect(parseJsonObject('{"version":2,"nested":{"on":true}}')).toEqual({
      ok: true,
      value: { version: 2, nested: { on: true } },
    });
  });

  it("reports invalid JSON with the SyntaxError JSON.parse threw", () => {
    const result = parseJsonObject('{ "version": 2,');

    if (result.ok || result.reason !== "invalid-json") {
      expect.unreachable(
        `expected invalid-json, got ${JSON.stringify(result)}`,
      );
    }

    expect(result.error).toBeInstanceOf(SyntaxError);
  });

  it("reports an array as not an object", () => {
    expect(parseJsonObject("[1, 2]")).toEqual({
      ok: false,
      reason: "not-object",
    });
  });

  it("reports null as not an object", () => {
    expect(parseJsonObject("null")).toEqual({
      ok: false,
      reason: "not-object",
    });
  });

  it("reports a string literal as not an object", () => {
    expect(parseJsonObject('"x"')).toEqual({
      ok: false,
      reason: "not-object",
    });
  });
});
