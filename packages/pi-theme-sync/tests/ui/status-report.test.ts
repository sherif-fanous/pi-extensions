import type { RuntimeStatus } from "../../src/types.js";
import {
  deliverStatusReport,
  formatStatusReport,
  renderStatusReport,
  STATUS_REPORT_ENTRY_TYPE,
} from "../../src/ui/status-report.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { createFakeContext } from "@sherif-fanous/pi-extensions-testing";
import { expect, test, vi } from "vitest";

const status: RuntimeStatus = {
  appliedTheme: "solarized-dark",
  availableDetectors: ["OSC 11", "System Appearance"],
  configStatusLines: [
    "Config:",
    "  User:    loaded",
    "           /agent/theme-sync/config.json",
    "  Project: skipped (untrusted)",
    "           /repo/.pi/theme-sync/config.json",
  ],
  currentAppearance: "dark",
  desiredTheme: "solarized-dark",
  detectionStrategy: "OSC 11",
  lastEvent: "Detected dark appearance",
  lastUpdateAt: 123,
  pollIntervalMs: 5000,
  syncEnabled: true,
  warnings: ["First warning.", "Second warning."],
};

test("formats every runtime status field, the Config block, and warnings", () => {
  const report = formatStatusReport(status, () => "formatted time");

  for (const row of [
    `${"Appearance:".padEnd(20)} dark`,
    `${"Applied theme:".padEnd(20)} solarized-dark`,
    `${"Desired theme:".padEnd(20)} solarized-dark`,
    `${"Sync:".padEnd(20)} on`,
    `${"Detection strategy:".padEnd(20)} OSC 11`,
    `${"Available detectors:".padEnd(20)} OSC 11, System Appearance`,
    `${"Polling interval:".padEnd(20)} 5000ms`,
    `${"Last update:".padEnd(20)} formatted time`,
    `${"Last event:".padEnd(20)} Detected dark appearance`,
  ]) {
    expect(report).toContain(row);
  }

  expect(report.startsWith("Theme Sync Status\n")).toBe(true);
  expect(report).toContain(status.configStatusLines.join("\n"));
  expect(report).toContain("- First warning.\n- Second warning.");
});

test("formats absent status values", () => {
  const report = formatStatusReport({
    ...status,
    availableDetectors: [],
    desiredTheme: undefined,
    lastUpdateAt: undefined,
    syncEnabled: false,
    warnings: [],
  });

  expect(report).toContain(`${"Desired theme:".padEnd(20)} none`);
  expect(report).toContain(`${"Sync:".padEnd(20)} off`);
  expect(report).toContain(`${"Available detectors:".padEnd(20)} none`);
  expect(report).toContain(`${"Last update:".padEnd(20)} never`);
});

test("formats a Unix epoch update instead of treating it as absent", () => {
  const formatTime = vi.fn(() => "Unix epoch");
  const report = formatStatusReport({ ...status, lastUpdateAt: 0 }, formatTime);

  expect(report).toContain(`${"Last update:".padEnd(20)} Unix epoch`);
  expect(formatTime).toHaveBeenCalledWith(0);
});

test("restyles persisted plain entry data with the current theme", () => {
  const body = formatStatusReport(status, () => "now");
  const oldTheme = {
    bold: (text: string) => `<old-bold>${text}</old-bold>`,
    fg: (color: string, text: string) => `<old-${color}>${text}</old-${color}>`,
  } as Theme;
  const newTheme = {
    bold: (text: string) => `<new-bold>${text}</new-bold>`,
    fg: (color: string, text: string) => `<new-${color}>${text}</new-${color}>`,
  } as Theme;
  const entry = { data: { body } };
  const oldRender = renderStatusReport(entry as never, {} as never, oldTheme);
  const newRender = renderStatusReport(entry as never, {} as never, newTheme);

  expect(oldRender?.render(100).join("\n")).toContain("<old-accent>");
  expect(newRender?.render(100).join("\n")).toContain("<new-accent>");
  expect(body).not.toContain("<old-");
});

test.each(["rpc", "json", "print"] as const)(
  "delivers plain report data as a notification in %s mode",
  (mode) => {
    const appendEntry = vi.fn();
    const notify = vi.fn();
    const body = formatStatusReport(status, () => "now");
    const ctx = createFakeContext({ mode, ui: { notify } });

    deliverStatusReport(ctx, { appendEntry }, { body });

    expect(appendEntry).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(body, "info");
  },
);

test("persists plain report data in a TUI transcript entry", () => {
  const appendEntry = vi.fn();
  const notify = vi.fn();
  const body = formatStatusReport(status, () => "now");
  const ctx = createFakeContext({ ui: { notify } });

  deliverStatusReport(ctx, { appendEntry }, { body });

  expect(appendEntry).toHaveBeenCalledWith(STATUS_REPORT_ENTRY_TYPE, { body });
  expect(notify).not.toHaveBeenCalled();
  expect(body).not.toContain("\x1b");
});
