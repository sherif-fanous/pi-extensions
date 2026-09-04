import {
  CONFIG_RANGES,
  DEFAULT_CONFIG,
  ENTRY_VERSION,
  isNotificationSeverity,
  SEVERITIES,
  type NotificationEntry,
} from "../src/types.js";
import { describe, expect, it } from "vitest";

describe("configuration constants", () => {
  it("documents the specified defaults", () => {
    expect(DEFAULT_CONFIG).toEqual({
      maxToastsVisible: 5,
      toast: { maxLines: 5, timeout: 3000, width: 64 },
    });
  });

  it("documents the specified ranges", () => {
    expect(CONFIG_RANGES).toEqual({
      maxToastsVisible: { max: 10, min: 1 },
      "toast.maxLines": { max: 20, min: 1 },
      "toast.timeout": { max: 60_000, min: 250 },
      "toast.width": { max: 80, min: 20 },
    });
  });

  it("keeps every default inside its own range", () => {
    const resolved: Record<string, number> = {
      maxToastsVisible: DEFAULT_CONFIG.maxToastsVisible,
      "toast.maxLines": DEFAULT_CONFIG.toast.maxLines,
      "toast.timeout": DEFAULT_CONFIG.toast.timeout,
      "toast.width": DEFAULT_CONFIG.toast.width,
    };

    for (const [path, range] of Object.entries(CONFIG_RANGES)) {
      expect(resolved[path]).toBeGreaterThanOrEqual(range.min);
      expect(resolved[path]).toBeLessThanOrEqual(range.max);
    }
  });
});

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
