import {
  ENTRY_VERSION,
  isNotificationSeverity,
  SEVERITIES,
  type NotificationEntry,
} from "../src/types.js";
import { describe, expect, it } from "vitest";

describe("isNotificationSeverity", () => {
  it("accepts exactly the supported severities", () => {
    expect(SEVERITIES).toEqual(["info", "warning", "error"]);

    for (const severity of SEVERITIES) {
      expect(isNotificationSeverity(severity)).toBe(true);
    }
  });

  it("rejects unsupported shapes", () => {
    for (const value of ["INFO", "debug", "", 1, null, undefined, {}]) {
      expect(isNotificationSeverity(value)).toBe(false);
    }
  });
});

describe("notification entry type", () => {
  it("accepts a fully populated supported shape", () => {
    const entry: NotificationEntry = {
      message: "hello",
      severity: "info",
      timestamp: 1_700_000_000_000,
      version: ENTRY_VERSION,
    };

    expect(entry.version).toBe(1);
  });
});
