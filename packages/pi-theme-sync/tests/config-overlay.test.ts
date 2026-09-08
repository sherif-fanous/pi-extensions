import type { LoadedRuntimeConfig } from "../src/types.js";
import { ConfigOverlayComponent } from "../src/ui/config-overlay.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, test, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  getSelectListTheme: () => ({
    description: (text: string) => text,
    noMatch: (text: string) => text,
    scrollInfo: (text: string) => text,
    selectedPrefix: (text: string) => text,
    selectedText: (text: string) => text,
  }),
}));

const config: LoadedRuntimeConfig = {
  runtimeConfig: {
    detection: { pollIntervalMs: 5000 },
    isSyncActive: true,
    themes: { dark: "dark", light: "light" },
  },
  runtimeConfigSources: {
    detection: { pollIntervalMs: "default" },
    isSyncActive: "global",
    themes: { dark: "project", light: "default" },
  },
  warnings: [],
};

const theme = {
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  fg: (color: string, text: string) =>
    `\x1b[3${color === "error" ? "1" : color === "success" ? "2" : color === "warning" ? "3" : "6"}m${text}\x1b[39m`,
} as Theme;

test("renders the main and every nested view in a complete frame", async () => {
  const overlay = createOverlay();

  assertFrame(overlay.component.render(58), "Theme Sync Config", 58);
  expect(overlay.component.render(58).join("\n")).toContain("Ctrl+S Save");

  overlay.component.handleInput("\r");
  assertFrame(overlay.component.render(58), "Light Mode Theme", 58);
  overlay.component.handleInput("\x1b");
  overlay.component.handleInput("\x1b[B");
  overlay.component.handleInput("\r");
  assertFrame(overlay.component.render(58), "Dark Mode Theme", 58);
  overlay.component.handleInput("\x1b");
  overlay.component.handleInput("\x1b[B");
  overlay.component.handleInput("\x1b[B");
  overlay.component.handleInput("\r");
  assertFrame(overlay.component.render(58), "Polling Interval", 58);
  overlay.component.handleInput("\x1b");
  overlay.component.handleInput("\x1b[B");
  overlay.component.handleInput("\x1b[B");
  overlay.component.handleInput("\x1b[B");
  overlay.component.handleInput("\r");
  assertFrame(overlay.component.render(58), "Sync Status", 58);
  overlay.component.handleInput("\x1b");
  overlay.component.handleInput("\x13");
  await vi.waitFor(() =>
    expect(overlay.component.render(58).join("\n")).toContain(
      "Write Config To",
    ),
  );
  assertFrame(overlay.component.render(58), "Write Config To", 58);
});

test.each([0, 1, 2])(
  "never exceeds an assigned width of %s columns",
  (width) => {
    const lines = createOverlay().component.render(width);

    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);

    if (width === 0) {
      expect(lines).toEqual([]);
    } else {
      expect(lines.at(-1)).toBe(width === 1 ? "└" : "└┘");
    }
  },
);

test("uses terminal height for a long list while keeping frame chrome visible", () => {
  const overlay = createOverlay({
    rows: 10,
    themeNames: Array.from(
      { length: 30 },
      (_, index) => `Theme ${String(index)}`,
    ),
  });

  overlay.component.handleInput("\r");

  const lines = overlay.component.render(50);

  expect(lines.length).toBeLessThanOrEqual(9);
  assertFrame(lines, "Light Mode Theme", 50);
});

test("keeps wrapped polling errors and frame chrome within a short terminal", () => {
  const overlay = createOverlay({ rows: 10 });

  for (const key of ["\x1b[B", "\x1b[B", "\r", "\x01", "\x0b", "999", "\r"]) {
    overlay.component.handleInput(key);
  }

  const lines = overlay.component.render(30);

  expect(lines.length).toBeLessThanOrEqual(9);
  expect(lines.join("\n")).toContain("\x1b[31m");
  expect(lines.at(-1)?.startsWith("└")).toBe(true);
});

test("polling input keeps focus, supports editing, validates, cancels, and restores focus", () => {
  const overlay = createOverlay();

  overlay.component.focused = true;
  for (const key of ["\x1b[B", "\x1b[B", "\r"])
    overlay.component.handleInput(key);

  expect(overlay.component.render(58).join("\n")).toContain("5000");
  expect(overlay.component.render(58).join("\n")).toContain("\x1b_pi:c\x07");
  overlay.component.handleInput("1");
  expect(overlay.component.render(58).join("\n")).toContain("50001");

  for (const key of ["\x01", "\x0b", "999", "\r"])
    overlay.component.handleInput(key);

  const invalid = overlay.component.render(58).join("\n");

  expect(invalid).toContain("Polling interval must be between 1000 and 60000");
  expect(invalid).toContain("milliseconds.");
  expect(invalid).toContain("\x1b[31m");
  overlay.component.handleInput("\x1b");
  expect(overlay.component.render(58).join("\n")).toContain(
    "Theme Sync Config",
  );
  expect(overlay.component.focused).toBe(true);

  for (const key of [
    "\r",
    "\x1b",
    "\x1b[B",
    "\x1b[B",
    "\r",
    "\x01",
    "\x0b",
    "1000",
    "\r",
  ]) {
    overlay.component.handleInput(key);
  }

  expect(overlay.component.render(58).join("\n")).toContain("1000ms");
});

test("keeps wrapped path failures inside a short complete frame", async () => {
  const failed = createOverlay({
    resolvePaths: vi
      .fn()
      .mockRejectedValue(
        new Error("permission denied for a deeply nested configuration path"),
      ),
    rows: 10,
  });

  failed.component.handleInput("\x13");
  await vi.waitFor(() =>
    expect(failed.component.render(34).join("\n")).toContain(
      "Error resolving config paths",
    ),
  );

  const lines = failed.component.render(34);

  expect(lines.length).toBeLessThanOrEqual(9);
  expect(lines.join("\n")).toContain("\x1b[31m");
  expect(lines.at(-1)?.startsWith("└")).toBe(true);
});

test.each([
  {
    expected: "Fix the invalid configuration",
    result: {
      ok: false as const,
      reason:
        "Fix the invalid configuration file at this unusually long location and try again.",
    },
    style: "\x1b[31m",
  },
  {
    expected: "Saved 1 changed setting(s)",
    result: { ok: true as const },
    style: "\x1b[32m",
  },
])(
  "renders a changed save result inside a short complete frame: $expected",
  async ({ expected, result, style }) => {
    const save = vi.fn().mockResolvedValue(result);
    const overlay = createOverlay({ rows: 10, save });

    for (const key of ["\r", "\x1b[B", "\r", "\x13"]) {
      overlay.component.handleInput(key);
    }

    await vi.waitFor(() =>
      expect(overlay.component.render(42).join("\n")).toContain(
        "Write Config To",
      ),
    );
    overlay.component.handleInput("\r");
    await vi.waitFor(() =>
      expect(overlay.component.render(42).join("\n")).toContain(expected),
    );

    const lines = overlay.component.render(42);

    expect(save).toHaveBeenCalledWith("project", { "themes.light": "dark" });
    expect(lines.length).toBeLessThanOrEqual(9);
    expect(lines.join("\n")).toContain(style);
    expect(lines.at(-1)?.startsWith("└")).toBe(true);
  },
);

test("renders path failures and save states inline with semantic styling", async () => {
  const failed = createOverlay({
    resolvePaths: vi.fn().mockRejectedValue(new Error("permission denied")),
  });

  failed.component.handleInput("\x13");
  await vi.waitFor(() => {
    const rendered = failed.component.render(46).join("\n");

    expect(rendered).toContain("Error resolving config paths: permission");
    expect(rendered).toContain("denied.");
  });
  expect(failed.component.render(46).join("\n")).toContain("\x1b[31m");

  let finish!: (value: { ok: true }) => void;
  const pending = new Promise<{ ok: true }>((resolve) => {
    finish = resolve;
  });
  const saving = createOverlay({ save: vi.fn().mockReturnValue(pending) });

  saving.component.handleInput("\x13");
  await vi.waitFor(() =>
    expect(saving.component.render(58).join("\n")).toContain("Write Config To"),
  );
  saving.component.handleInput("\r");
  expect(saving.component.render(58).join("\n")).toContain(
    "Saving configuration.",
  );
  expect(saving.component.render(58).join("\n")).toContain("\x1b[33m");
  finish({ ok: true });
  await vi.waitFor(() =>
    expect(saving.component.render(58).join("\n")).toContain(
      "No changes to save.",
    ),
  );
});

function assertFrame(lines: string[], title: string, width: number): void {
  expect(lines[0]).toContain(title);
  expect(lines[0]?.startsWith("┌")).toBe(true);
  expect(lines[0]?.endsWith("┐")).toBe(true);
  expect(lines.at(-1)?.startsWith("└")).toBe(true);
  expect(lines.at(-1)?.endsWith("┘")).toBe(true);
  expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
}

function createOverlay(
  overrides: {
    resolvePaths?: () => Promise<{ global: string; project: string }>;
    rows?: number;
    save?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
    themeNames?: string[];
  } = {},
) {
  const done = vi.fn();
  const requestRender = vi.fn();
  const component = new ConfigOverlayComponent({
    config,
    done,
    requestRender,
    resolvePaths:
      overrides.resolvePaths ??
      vi.fn().mockResolvedValue({
        global: "/a/very/long/global/configuration/path/settings.json",
        project: "/a/very/long/project/configuration/path/settings.json",
      }),
    save: overrides.save ?? vi.fn().mockResolvedValue({ ok: true }),
    terminalRows: () => overrides.rows ?? 30,
    theme,
    themeNames: overrides.themeNames ?? ["light", "dark", "界-wide-theme"],
  });

  return { component, done, requestRender };
}
