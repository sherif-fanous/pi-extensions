import {
  malformedConfigWarning,
  unreadableConfigWarning,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("unreadableConfigWarning", () => {
  it("ends the error message with one full stop", () => {
    expect(
      unreadableConfigWarning("/a/config.json", new Error("EACCES: denied")),
    ).toBe(
      "Could not read configuration at /a/config.json: EACCES: denied. Ignored the file.",
    );
  });

  it("keeps a full stop the error message already ends in", () => {
    expect(
      unreadableConfigWarning(
        "/a/config.json",
        new Error("Permission denied."),
      ),
    ).toBe(
      "Could not read configuration at /a/config.json: Permission denied. Ignored the file.",
    );
  });
});

describe("malformedConfigWarning", () => {
  it("describes invalid JSON with the parse error", () => {
    expect(
      malformedConfigWarning("/a/config.json", {
        ok: false,
        reason: "invalid-json",
        error: new SyntaxError("Unexpected end of JSON input"),
      }),
    ).toBe(
      "Configuration at /a/config.json is not valid JSON: Unexpected end of JSON input. Ignored the file.",
    );
  });

  it("describes a non-object value", () => {
    expect(
      malformedConfigWarning("/a/config.json", {
        ok: false,
        reason: "not-object",
      }),
    ).toBe(
      "Configuration at /a/config.json must be a JSON object. Ignored the file.",
    );
  });
});
