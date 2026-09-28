/**
 * Covers the clear report: the lead sentence chosen for a set of cleared
 * fields, the value each row shows, the severity, and the title.
 */
import type { ClearPart } from "../../src/activation/clear.js";
import { clearReport } from "../../src/ui/clear-report.js";
import { describe, expect, it } from "vitest";

/** Build a clear part, defaulting the fields a test does not care about. */
const part = (
  action: ClearPart["action"],
  field: ClearPart["field"] = "model",
  value = "x",
): ClearPart => ({ action, field, value });

/** The value the report shows on the model row. */
function modelRowValue(clearPart: ClearPart): string | undefined {
  return /^ {2}Model: +(.*)$/mu.exec(
    clearReport("plan", [clearPart]).body,
  )?.[1];
}

describe("clearReport", () => {
  it("is titled like its heading and names the cleared preset", () => {
    const report = clearReport("plan", [part("restored")]);

    expect(report.title).toBe("Presets Plus Cleared");
    expect(report.body.startsWith(`${report.title}\n`)).toBe(true);
    expect(report.body).toMatch(/^ {2}Preset: +plan$/mu);
  });

  it.each([
    [
      "every field is unknown",
      [
        part("unknown", "model"),
        part("unknown", "thinking"),
        part("unknown", "tools"),
      ],
      "No saved baseline. Pi left your current settings unchanged.",
    ],
    [
      "any field failed to restore",
      [
        part("restore-failed", "model"),
        part("restored", "thinking"),
        part("already-baseline", "tools"),
      ],
      "Pi could not restore all of your previous settings.",
    ],
    [
      "nothing changed",
      [
        part("already-baseline", "model"),
        part("already-baseline", "thinking"),
        part("already-baseline", "tools"),
      ],
      "Your settings already matched the saved baseline.",
    ],
    [
      "every field is restore-like",
      [
        part("restored", "model"),
        part("already-baseline", "thinking"),
        part("restored", "tools"),
      ],
      "Pi restored your previous settings.",
    ],
    [
      "restore-like fields include restored-partial",
      [
        part("restored", "model"),
        part("restored", "thinking"),
        part("restored-partial", "tools"),
      ],
      "Pi restored your previous settings. Some tools are no longer available.",
    ],
    [
      "no field is restore-like",
      [
        part("user-override", "model"),
        part("baseline-null", "thinking"),
        part("not-owned", "tools"),
      ],
      "Pi kept all your manual changes. There was nothing else to restore.",
    ],
    [
      "restore-like and kept-like fields coexist",
      [
        part("user-override", "model"),
        part("restored", "thinking"),
        part("not-owned", "tools"),
      ],
      "Pi restored some settings and kept your manual changes for the rest.",
    ],
  ])("leads with the right sentence when %s", (_case, parts, lead) => {
    expect(clearReport("plan", parts).body.split("\n")).toContain(lead);
  });

  it.each([
    [part("already-baseline"), "x"],
    [part("restored"), "x"],
    [part("baseline-null"), "x (No baseline saved for this field)"],
    [part("unknown"), "x (No baseline saved for this field)"],
    [part("not-owned"), "x (Not managed by cleared preset)"],
    [part("restore-failed"), "Pi could not switch back to x."],
    [
      {
        action: "restored-partial",
        dropped: ["bash"],
        field: "model",
        value: "read",
      } satisfies ClearPart,
      "read (Unavailable: bash)",
    ],
    [
      part("user-override"),
      "x (Left as-is because you changed it after activation)",
    ],
  ])("shows %o as its row value", (clearPart, expected) => {
    expect(modelRowValue(clearPart)).toBe(expected);
  });

  it.each([
    ["already-baseline", "info"],
    ["baseline-null", "info"],
    ["not-owned", "info"],
    ["restore-failed", "warning"],
    ["restored", "info"],
    ["restored-partial", "warning"],
    ["unknown", "info"],
    ["user-override", "info"],
  ] as const)("reports a %s field at %s severity", (action, severity) => {
    expect(
      clearReport("plan", [part("restored", "thinking"), part(action)])
        .severity,
    ).toBe(severity);
  });
});
