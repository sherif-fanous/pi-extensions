/**
 * Covers the `--preset` flag: its registration and how its value is read
 * into a preset name.
 */
import { readPresetFlag, registerPresetFlag } from "../src/flag.js";
import { createFakePi } from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

describe("registerPresetFlag", () => {
  it("declares --preset as a string flag", () => {
    const fake = createFakePi();

    registerPresetFlag(fake.pi);

    expect(fake.flags.get("preset")).toEqual({
      description: "Activate the named Presets Plus preset at startup",
      type: "string",
    });
  });
});

describe("readPresetFlag", () => {
  it.each([
    ["an absent flag", undefined, undefined],
    ["a boolean value", true, undefined],
    ["a blank value", "   ", undefined],
    ["a padded name", "  Deep Work  ", "Deep Work"],
  ])("reads %s as %j", (_label, value, expected) => {
    const { pi } = createFakePi({
      getFlag: (name) => (name === "preset" ? value : undefined),
    });

    expect(readPresetFlag(pi)).toBe(expected);
  });
});
