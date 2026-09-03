import {
  createNotificationEntry,
  readNotificationHistory,
  type BranchEntry,
} from "../src/history.js";
import { CUSTOM_ENTRY_TYPE, ENTRY_VERSION } from "../src/types.js";
import { describe, expect, it } from "vitest";

describe("createNotificationEntry", () => {
  it("stamps the current schema version and the supplied fields", () => {
    const entry = createNotificationEntry("boom", "error", 42);

    expect(entry).toEqual({
      message: "boom",
      severity: "error",
      timestamp: 42,
      version: ENTRY_VERSION,
    });
  });

  it("defaults the timestamp to capture time", () => {
    const before = Date.now();
    const entry = createNotificationEntry("hi", "info");

    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
  });
});

describe("readNotificationHistory", () => {
  it("returns branch entries in branch order", () => {
    const branch = [
      customEntry(createNotificationEntry("first", "info", 1)),
      customEntry(createNotificationEntry("second", "warning", 2)),
      customEntry(createNotificationEntry("third", "error", 3)),
    ];

    expect(
      readNotificationHistory(branch).map((entry) => entry.message),
    ).toEqual(["first", "second", "third"]);
  });

  it("preserves a complete multiline message", () => {
    const message = "line one\nline two\n\nline four";
    const branch = [customEntry(createNotificationEntry(message, "info", 1))];

    expect(readNotificationHistory(branch)[0]?.message).toBe(message);
  });

  it("only sees entries on the branch it is given", () => {
    const branchA = [customEntry(createNotificationEntry("a", "info", 1))];
    const branchB = [customEntry(createNotificationEntry("b", "info", 2))];

    expect(
      readNotificationHistory(branchA).map((entry) => entry.message),
    ).toEqual(["a"]);

    expect(
      readNotificationHistory(branchB).map((entry) => entry.message),
    ).toEqual(["b"]);
    expect(readNotificationHistory([])).toEqual([]);
  });

  it("skips entries owned by other extensions or message types", () => {
    const branch: BranchEntry[] = [
      { customType: "other:entry", data: { message: "x" }, type: "custom" },
      { type: "message" },
      customEntry(createNotificationEntry("mine", "info", 1)),
    ];

    expect(
      readNotificationHistory(branch).map((entry) => entry.message),
    ).toEqual(["mine"]);
  });

  it("skips invalid custom entries instead of rendering partial records", () => {
    const branch: BranchEntry[] = [
      customEntry({ ...createNotificationEntry("v2", "info", 1), version: 2 }),
      customEntry({ message: "no version", severity: "info", timestamp: 1 }),
      customEntry({ message: 5, severity: "info", timestamp: 1, version: 1 }),
      customEntry({
        message: "s",
        severity: "debug",
        timestamp: 1,
        version: 1,
      }),
      customEntry({
        message: "t",
        severity: "info",
        timestamp: "x",
        version: 1,
      }),
      customEntry(undefined),
      customEntry(null),
      customEntry(createNotificationEntry("good", "warning", 9)),
    ];

    expect(readNotificationHistory(branch)).toEqual([
      createNotificationEntry("good", "warning", 9),
    ]);
  });
});

function customEntry(data: unknown): BranchEntry {
  return { customType: CUSTOM_ENTRY_TYPE, data, type: "custom" };
}
