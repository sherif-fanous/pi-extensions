import { runThemeSyncCommand } from "../../src/commands/theme-sync.js";
import type { ThemeSyncRuntime } from "../../src/runtime.js";
import type { RuntimeStatus } from "../../src/types.js";
import { STATUS_REPORT_ENTRY_TYPE } from "../../src/ui/status-report.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { overlayOptions } from "@sherif-fanous/pi-extensions-core";
import { createFakeContext } from "@sherif-fanous/pi-extensions-testing";
import { afterEach, expect, test, vi } from "vitest";

const status: RuntimeStatus = {
  appliedTheme: "dark",
  availableDetectors: [],
  configFiles: [],
  currentAppearance: "dark",
  desiredTheme: "dark",
  detectionStrategy: "OSC 11",
  lastEvent: "Updated.",
  pollIntervalMs: 5000,
  syncEnabled: true,
  warnings: [],
};

const runtime = {
  dispose: vi.fn(),
  getStatus: vi.fn(() => status),
  startSession: vi.fn(),
} as unknown as ThemeSyncRuntime;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("bare command opens configuration directly at the main overlay size", async () => {
  const custom = vi.fn().mockResolvedValue(undefined);
  const appendEntry = vi.fn();
  const notify = vi.fn();
  const ctx = commandContext("tui", custom, notify);

  await runThemeSyncCommand("   ", ctx, { pi: { appendEntry }, runtime });

  expect(custom).toHaveBeenCalledOnce();

  expect(custom.mock.calls[0]?.[1]).toEqual({
    overlay: true,
    overlayOptions: overlayOptions("main"),
  });
  expect(appendEntry).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

test("status appends a report and does not open an overlay", async () => {
  const custom = vi.fn();
  const appendEntry = vi.fn();
  const ctx = commandContext("tui", custom);

  await runThemeSyncCommand(" status ", ctx, { pi: { appendEntry }, runtime });

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

  await runThemeSyncCommand("unknown", ctx, {
    pi: { appendEntry: vi.fn() },
    runtime,
  });

  expect(custom).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith(
    'Theme Sync: 1 warning\n- Unknown subcommand "unknown". Try /theme-sync or /theme-sync status.',
    "warning",
  );
});

function commandContext(
  mode: ExtensionCommandContext["mode"],
  custom: ExtensionCommandContext["ui"]["custom"],
  notify = vi.fn(),
): ExtensionCommandContext {
  return createFakeContext({
    cwd: "/unused-command-routing",
    mode,
    ui: { custom, notify },
  });
}
