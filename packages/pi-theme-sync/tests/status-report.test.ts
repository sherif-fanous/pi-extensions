import type { RuntimeStatus } from "../src/types.js";
import {
  deliverStatusReport,
  formatStatusReport,
  renderStatusReport,
  STATUS_REPORT_ENTRY_TYPE,
  styleStatusReport,
} from "../src/ui/status-report.js";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";

const status: RuntimeStatus = {
  appliedTheme: "solarized-dark",
  availableDetectors: ["OSC 11", "System Appearance"],
  configSources: {
    detection: { pollIntervalMs: "project" },
    isSyncActive: "global",
    themes: { dark: "project", light: "default" },
  },
  currentAppearance: "dark",
  desiredTheme: "solarized-dark",
  detectionStrategy: "OSC 11",
  lastEvent: "Detected dark appearance",
  lastUpdateAt: 123,
  pollIntervalMs: 5000,
  syncStatus: "active",
  warnings: ["First warning.", "Second warning."],
};

test("formats every runtime status field while omitting config provenance", () => {
  const report = formatStatusReport(status, () => "formatted time");

  expect(report).toBe(
    [
      "Theme Sync Status",
      `  ${"Appearance:".padEnd(20)} dark`,
      `  ${"Applied Theme:".padEnd(20)} solarized-dark`,
      `  ${"Desired Theme:".padEnd(20)} solarized-dark`,
      `  ${"Sync Active:".padEnd(20)} yes`,
      `  ${"Detection Strategy:".padEnd(20)} OSC 11`,
      `  ${"Available Detectors:".padEnd(20)} OSC 11, System Appearance`,
      `  ${"Polling Interval:".padEnd(20)} 5000ms`,
      `  ${"Last Update:".padEnd(20)} formatted time`,
      `  ${"Last Event:".padEnd(20)} Detected dark appearance`,
      "",
      "Warnings:",
      "  - First warning.",
      "  - Second warning.",
    ].join("\n"),
  );
  expect(report).not.toContain("Config");
});

test("formats absent status values without a warning section", () => {
  const report = formatStatusReport({
    ...status,
    availableDetectors: [],
    desiredTheme: undefined,
    lastUpdateAt: undefined,
    syncStatus: "inactive",
    warnings: [],
  });

  expect(report).toContain(`${"Desired Theme:".padEnd(20)} n/a`);
  expect(report).toContain(`${"Sync Active:".padEnd(20)} no`);
  expect(report).toContain(`${"Available Detectors:".padEnd(20)} none`);
  expect(report).toContain(`${"Last Update:".padEnd(20)} never`);
  expect(report).not.toContain("Warnings:");
});

test("formats a Unix epoch update instead of treating it as absent", () => {
  const formatTime = vi.fn(() => "Unix epoch");
  const report = formatStatusReport({ ...status, lastUpdateAt: 0 }, formatTime);

  expect(report).toContain(`${"Last Update:".padEnd(20)} Unix epoch`);
  expect(formatTime).toHaveBeenCalledWith(0);
});

test("styles heading, labels, and warning rows with semantic colors", () => {
  const theme = {
    bold: (text: string) => `<bold>${text}</bold>`,
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  } as Theme;
  const styled = styleStatusReport(
    formatStatusReport(status, () => "now"),
    theme,
  );

  expect(styled).toContain("<accent><bold>Theme Sync Status</bold></accent>");
  expect(styled).toContain("<muted>Appearance:</muted>          dark");
  expect(styled).toContain("<warning>Warnings:</warning>");
  expect(styled).toContain("<warning>  - First warning.</warning>");
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
    const ctx = {
      mode,
      ui: {
        notify,
        theme: {
          bold: (text: string) => text,
          fg: (_color: string, text: string) => text,
        },
      },
    } as unknown as ExtensionContext;

    deliverStatusReport(ctx, { appendEntry }, { body });

    expect(appendEntry).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(body, "info");
  },
);

test("persists plain report data in a TUI transcript entry", () => {
  const appendEntry = vi.fn();
  const notify = vi.fn();
  const body = formatStatusReport(status, () => "now");
  const ctx = { mode: "tui", ui: { notify } } as unknown as ExtensionContext;

  deliverStatusReport(ctx, { appendEntry }, { body });

  expect(appendEntry).toHaveBeenCalledWith(STATUS_REPORT_ENTRY_TYPE, { body });
  expect(notify).not.toHaveBeenCalled();
  expect(body).not.toContain("\x1b");
});
