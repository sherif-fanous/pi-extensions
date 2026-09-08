import { promises as fs } from "node:fs";

import { runThemeSyncCommand } from "../src/command.js";
import type { ThemeSyncRuntime } from "../src/runtime.js";
import type { RuntimeStatus } from "../src/types.js";
import { STATUS_REPORT_ENTRY_TYPE } from "../src/ui/status-report.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";

const status: RuntimeStatus = {
  appliedTheme: "dark",
  availableDetectors: [],
  configSources: {
    detection: { pollIntervalMs: "default" },
    isSyncActive: "default",
    themes: { dark: "default", light: "default" },
  },
  currentAppearance: "dark",
  desiredTheme: "dark",
  detectionStrategy: "OSC 11",
  lastEvent: "Updated.",
  pollIntervalMs: 5000,
  syncStatus: "active",
  warnings: [],
};

const runtime = {
  cleanup: vi.fn(),
  getStatus: vi.fn(() => status),
  setupAppearanceMonitoring: vi.fn(),
} as unknown as ThemeSyncRuntime;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("bare command opens configuration directly", async () => {
  vi.spyOn(fs, "readFile").mockRejectedValue(
    Object.assign(new Error("missing"), { code: "ENOENT" }),
  );

  const custom = vi.fn().mockResolvedValue(undefined);
  const appendEntry = vi.fn();
  const notify = vi.fn();
  const ctx = commandContext("tui", custom, notify);

  await runThemeSyncCommand("   ", runtime, ctx, { appendEntry });

  expect(custom).toHaveBeenCalledOnce();

  const overlayOptions = custom.mock.calls[0]?.[1] as unknown as {
    overlayOptions?: { width?: number };
  };

  expect(overlayOptions.overlayOptions?.width).toBe(80);
  expect(appendEntry).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

test("status appends a report and does not open an overlay", async () => {
  const custom = vi.fn();
  const appendEntry = vi.fn();
  const ctx = commandContext("tui", custom);

  await runThemeSyncCommand(" status ", runtime, ctx, { appendEntry });

  expect(custom).not.toHaveBeenCalled();
  expect(appendEntry).toHaveBeenCalledOnce();

  const [entryType, data] = appendEntry.mock.calls[0] as unknown as [
    string,
    { body: string },
  ];

  expect(entryType).toBe(STATUS_REPORT_ENTRY_TYPE);
  expect(data.body).toContain("Theme Sync Status");
});

test("unknown arguments report punctuated usage without opening an overlay", async () => {
  const custom = vi.fn();
  const notify = vi.fn();
  const ctx = commandContext("tui", custom, notify);

  await runThemeSyncCommand("unknown", runtime, ctx, { appendEntry: vi.fn() });

  expect(custom).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith(
    "Usage: /theme-sync or /theme-sync status.",
    "warning",
  );
});

function commandContext(
  mode: ExtensionCommandContext["mode"],
  custom: ExtensionCommandContext["ui"]["custom"],
  notify = vi.fn(),
): ExtensionCommandContext {
  return {
    cwd: "/unused-command-routing",
    mode,
    ui: {
      custom,
      getAllThemes: () => [],
      notify,
      theme: {
        bold: (text: string) => text,
        fg: (_color: string, text: string) => text,
      },
    },
  } as unknown as ExtensionCommandContext;
}
