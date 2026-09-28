import type { LoadedRuntimeConfig } from "../src/types.js";
import { ConfigOverlayComponent } from "../src/ui/config-overlay.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type KeybindingsConfig } from "@earendil-works/pi-tui";
import { overlayMaxHeight } from "@sherif-fanous/pi-extensions-core";
import {
  createPiKeybindings,
  findOverflowingLines,
  flushPromises,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { expect, test, vi } from "vitest";

const DOWN = "\x1b[B";
const UP = "\x1b[A";
const PAGE_DOWN = "\x1b[6~";
const PAGE_UP = "\x1b[5~";
const ENTER = "\r";
const ESC = "\x1b";
const HELP_KEY = "\x1bOP";
const CTRL_S = "\x13";

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

const COLOR_CODES: Readonly<Record<string, string>> = {
  accent: "36",
  border: "34",
  dim: "90",
  error: "31",
  muted: "37",
  success: "32",
};

const theme = {
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  fg: (color: string, text: string) =>
    `\x1b[${COLOR_CODES[color] ?? "35"}m${text}\x1b[39m`,
} as Theme;

test("renders the form and every nested step in a complete frame with a Title Case title", async () => {
  const overlay = createOverlay();

  assertFrame(overlay.component.render(58), "Theme Sync Config", 58);
  overlay.input(ENTER);
  assertFrame(overlay.component.render(58), "Light Mode Theme", 58);
  overlay.input(ESC, DOWN, ENTER);
  assertFrame(overlay.component.render(58), "Dark Mode Theme", 58);
  overlay.input(ESC, DOWN, ENTER);
  assertFrame(overlay.component.render(58), "Polling Interval", 58);
  overlay.input(ESC, DOWN, ENTER);
  assertFrame(overlay.component.render(58), "Sync Status", 58);
  overlay.input(ESC, HELP_KEY);
  assertFrame(overlay.component.render(58), "Sync Status Help", 58);
  overlay.input(ESC, CTRL_S);
  await vi.waitFor(() =>
    expect(topBorder(overlay.component.render(58))).toContain(
      "Write Config To",
    ),
  );
  assertFrame(overlay.component.render(58), "Write Config To", 58);
});

test("draws the border in the border color and the title in bold accent", () => {
  const lines = createOverlay().component.render(80);
  const top = topBorder(lines);
  const bottom = lines.at(-1);

  expect(top).toContain("\x1b[34m┌─ \x1b[39m");
  expect(top).toContain("\x1b[36m\x1b[1mTheme Sync Config\x1b[22m\x1b[39m");
  expect(bottom).toMatch(/^\x1b\[34m└─+┘\x1b\[39m$/);
});

test.each([
  {
    expected:
      "↑/↓ Move · Enter Edit · F1 Help · Ctrl+S Save · Ctrl+R Reload · Esc Close",
    keys: [],
  },
  { expected: "↑/↓ Move · Enter Select · Esc Back", keys: [ENTER] },
  {
    expected: "↑/↓ Move · Enter Select · Esc Back",
    keys: [DOWN, DOWN, DOWN, ENTER],
  },
  { expected: "Enter Confirm · Esc Cancel", keys: [DOWN, DOWN, ENTER] },
  { expected: "Esc Back", keys: [HELP_KEY] },
])(
  "footer lists the keys of the current step: $expected",
  ({ expected, keys }) => {
    const overlay = createOverlay();

    overlay.input(...keys);

    expect(footerText(overlay.component.render(120))).toBe(expected);
  },
);

test("write target footer offers Save and Back", async () => {
  const overlay = createOverlay();

  overlay.input(CTRL_S);
  await vi.waitFor(() =>
    expect(footerText(overlay.component.render(120))).toBe(
      "↑/↓ Move · Enter Save · Esc Back",
    ),
  );
});

test("wraps the footer between hints instead of cutting one", () => {
  const lines = createOverlay().component.render(40);
  const footer = footerLines(lines);

  expect(footer.length).toBeGreaterThan(1);
  expect(footer.join(" · ")).toBe(
    "↑/↓ Move · Enter Edit · F1 Help · Ctrl+S Save · Ctrl+R Reload · Esc Close",
  );
  expect(findOverflowingLines(lines, 40)).toEqual([]);
});

test("names and accepts only the keys the user has bound", () => {
  const overlay = createOverlay({
    keybindings: {
      "tui.select.cancel": "q",
      "tui.select.confirm": "space",
      "tui.select.down": "j",
      "tui.select.up": "k",
    },
  });

  expect(footerText(overlay.component.render(120))).toBe(
    "k/j Move · Space Edit · F1 Help · Ctrl+S Save · Ctrl+R Reload · q Close",
  );

  overlay.input(DOWN, ENTER, ESC);
  expect(selectedRow(overlay.component.render(120))).toContain(
    "Light mode theme",
  );
  expect(overlay.done).not.toHaveBeenCalled();

  overlay.input("j", " ");
  expect(topBorder(overlay.component.render(120))).toContain("Dark Mode Theme");
  overlay.input("q");
  expect(topBorder(overlay.component.render(120))).toContain(
    "Theme Sync Config",
  );
  overlay.input("q");
  expect(overlay.done).toHaveBeenCalledOnce();
});

test("marks the focused form row with ▌ and the selected list row with →", () => {
  const overlay = createOverlay();
  const form = overlay.component.render(80).map((line) => stripAnsi(line));

  expect(form[1]).toMatch(/^│ ▌ Light mode theme\s+light \[Default\]\s+│$/);
  expect(form[2]).toMatch(/^│ {3}Dark mode theme\s+dark \[Project\]\s+│$/);
  expect(overlay.component.render(80)[1]).toContain("\x1b[36m▌\x1b[39m");

  overlay.input(ENTER);

  const list = overlay.component.render(80).map((line) => stripAnsi(line));

  expect(list[1]).toMatch(/^│ → light\s+│$/);
  expect(list[2]).toMatch(/^│ {3}dark\s+│$/);
});

test("keeps the focused form row when a nested step returns", () => {
  const overlay = createOverlay();

  overlay.input(DOWN, DOWN, ENTER, ESC);

  expect(selectedRow(overlay.component.render(80))).toContain(
    "Polling interval",
  );

  overlay.input(HELP_KEY, ESC);

  expect(selectedRow(overlay.component.render(80))).toContain(
    "Polling interval",
  );
});

test("pages a long theme list, stops at its ends, wraps ↑/↓, and shows its position", () => {
  const overlay = createOverlay({
    rows: 12,
    themeNames: Array.from(
      { length: 30 },
      (_, index) => `Theme ${String(index)}`,
    ),
  });

  overlay.input(ENTER);

  let lines = overlay.component.render(50);

  expect(lines.length).toBeLessThanOrEqual(overlayMaxHeight(12));
  expect(stripAnsi(topBorder(lines))).toMatch(
    /Light Mode Theme ─+ \(1\/30\) ─┐$/,
  );
  expect(topBorder(lines)).toContain("\x1b[37m(1/30)\x1b[39m");
  expect(footerText(lines)).toBe(
    "↑/↓ Move · PgUp/PgDn Page · Enter Select · Esc Back",
  );

  const pageRows = bodyLines(lines).length;

  overlay.input(PAGE_DOWN);
  expect(stripAnsi(topBorder(overlay.component.render(50)))).toContain(
    `(${String(pageRows + 1)}/30)`,
  );
  overlay.input(...Array.from({ length: 10 }, () => PAGE_DOWN));
  lines = overlay.component.render(50);
  expect(stripAnsi(topBorder(lines))).toContain("(30/30)");
  expect(selectedRow(lines)).toContain("Theme 29");

  overlay.input(DOWN);
  expect(stripAnsi(topBorder(overlay.component.render(50)))).toContain(
    "(1/30)",
  );
  overlay.input(UP);
  expect(stripAnsi(topBorder(overlay.component.render(50)))).toContain(
    "(30/30)",
  );
  overlay.input(...Array.from({ length: 7 }, () => PAGE_UP));
  expect(stripAnsi(topBorder(overlay.component.render(50)))).toContain(
    "(2/30)",
  );
  overlay.input(PAGE_UP, PAGE_UP);
  expect(stripAnsi(topBorder(overlay.component.render(50)))).toContain(
    "(1/30)",
  );
});

test("hides PgUp/PgDn and the position while a list fits", () => {
  const lines = createOverlay().component.render(80);

  expect(footerText(lines)).not.toContain("PgUp/PgDn");
  expect(stripAnsi(topBorder(lines))).not.toMatch(/\(\d+\/\d+\)/);
});

test.each([
  { expected: "Light Mode Theme Help", keys: [HELP_KEY], text: "light mode" },
  {
    expected: "Dark Mode Theme Help",
    keys: [DOWN, HELP_KEY],
    text: "dark mode",
  },
  {
    expected: "Polling Interval Help",
    keys: [DOWN, DOWN, "\x1b[1;1:1P"],
    text: "milliseconds",
  },
  {
    expected: "Sync Status Help",
    keys: [UP, "\x1b[57364u"],
    text: "Inactive leaves",
  },
])(
  "F1 opens help for the focused row: $expected",
  ({ expected, keys, text }) => {
    const overlay = createOverlay();

    overlay.input(...keys);

    const lines = overlay.component.render(80);

    assertFrame(lines, expected, 80);
    expect(bodyLines(lines).join(" ")).toContain(text);
    overlay.input(ESC);
    expect(topBorder(overlay.component.render(80))).toContain(
      "Theme Sync Config",
    );
    expect(overlay.done).not.toHaveBeenCalled();
  },
);

test("scrolls long help text on a short terminal with its keys in the footer", () => {
  const overlay = createOverlay({ rows: 12 });

  overlay.input(HELP_KEY);

  let lines = overlay.component.render(40);

  expect(lines.length).toBeLessThanOrEqual(overlayMaxHeight(12));
  expect(footerText(lines)).toBe("↑/↓ Scroll · PgUp/PgDn Page · Esc Back");
  expect(findOverflowingLines(lines, 40)).toEqual([]);

  const first = bodyLines(lines)[0];

  expect(stripAnsi(bodyLines(lines).at(-1) ?? "")).toMatch(/↓$/);
  overlay.input(DOWN);
  lines = overlay.component.render(40);
  expect(bodyLines(lines)[0]).not.toBe(first);
  expect(stripAnsi(bodyLines(lines)[0] ?? "")).toMatch(/↑$/);
  // Paging past the end and back needs no extra presses.
  overlay.input(...Array.from({ length: 10 }, () => PAGE_DOWN));
  lines = overlay.component.render(40);
  expect(stripAnsi(bodyLines(lines).at(-1) ?? "")).not.toMatch(/↓$/);
  overlay.input(PAGE_UP);
  expect(
    stripAnsi(bodyLines(overlay.component.render(40)).at(-1) ?? ""),
  ).toMatch(/↓$/);
  overlay.input(...Array.from({ length: 10 }, () => PAGE_UP));
  expect(bodyLines(overlay.component.render(40))[0]).toBe(first);
});

test.each([40, 30, 20, 8, 3, 1])(
  "fits every step within %s columns",
  async (width) => {
    const overlay = createOverlay({ rows: 14 });
    const check = (): void => {
      expect(
        findOverflowingLines(overlay.component.render(width), width),
      ).toEqual([]);
    };

    check();
    overlay.input(ENTER);
    check();
    overlay.input(ESC, DOWN, DOWN, ENTER);
    check();
    overlay.input("x", ENTER);
    check();
    overlay.input(ESC, HELP_KEY);
    check();
    overlay.input(ESC, CTRL_S);
    await flushPromises();
    expect(overlay.resolvePaths).toHaveBeenCalledOnce();
    check();
  },
);

test("returns nothing at width 0", () => {
  expect(createOverlay().component.render(0)).toEqual([]);
});

test("shows a muted empty state when no themes are installed", () => {
  const overlay = createOverlay({ themeNames: [] });

  overlay.input(ENTER);

  const lines = overlay.component.render(60);

  expect(lines[1]).toContain("\x1b[37mNo themes are available.\x1b[39m");
  expect(footerText(lines)).toBe("Esc Back");
  overlay.input(ENTER);
  expect(topBorder(overlay.component.render(60))).toContain("Light Mode Theme");
});

test("keeps wrapped polling errors and frame chrome within a short terminal", () => {
  const overlay = createOverlay({ rows: 10 });

  overlay.input(DOWN, DOWN, ENTER, "\x01", "\x0b", "999", ENTER);

  const lines = overlay.component.render(30);

  expect(lines.length).toBeLessThanOrEqual(overlayMaxHeight(10));
  expect(lines.join("\n")).toContain("\x1b[31m");
  expect(stripAnsi(lines.at(-1) ?? "").startsWith("└")).toBe(true);
});

test("polling input keeps focus, supports editing, validates, cancels, and restores focus", () => {
  const overlay = createOverlay();

  overlay.component.focused = true;
  overlay.input(DOWN, DOWN, ENTER);

  expect(overlay.component.render(58).join("\n")).toContain("5000");
  expect(overlay.component.render(58).join("\n")).toContain("\x1b_pi:c\x07");
  overlay.input("1");
  expect(overlay.component.render(58).join("\n")).toContain("50001");

  overlay.input("\x01", "\x0b", "999", ENTER);

  const invalid = stripAnsi(overlay.component.render(58).join("\n"));

  expect(invalid).toContain("Polling interval must be between 1000 and 60000");
  expect(invalid).toContain("milliseconds.");
  expect(overlay.component.render(58).join("\n")).toContain("\x1b[31m");
  overlay.input(ESC);
  expect(topBorder(overlay.component.render(58))).toContain(
    "Theme Sync Config",
  );
  expect(overlay.component.focused).toBe(true);

  overlay.input(ENTER, "\x01", "\x0b", "1000", ENTER);

  expect(overlay.component.render(58).join("\n")).toContain("1000ms");
});

test("keeps wrapped path failures inside a short complete frame", async () => {
  const failed = createOverlay({
    resolvePaths: vi
      .fn()
      .mockRejectedValue(
        new Error("permission denied for a deeply nested configuration path"),
      ),
    rows: 12,
  });

  failed.input(CTRL_S);
  await vi.waitFor(() =>
    expect(stripAnsi(failed.component.render(34).join("\n"))).toContain(
      "Could not resolve the",
    ),
  );

  const lines = failed.component.render(34);

  expect(lines.length).toBeLessThanOrEqual(overlayMaxHeight(12));
  expect(lines.join("\n")).toContain("\x1b[31m");
  expect(stripAnsi(lines.at(-1) ?? "").startsWith("└")).toBe(true);
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
    expected: "Saved 1 changed setting to Project.",
    result: { ok: true as const },
    style: "\x1b[32m",
  },
])(
  "renders a changed save result inside a short complete frame: $expected",
  async ({ expected, result, style }) => {
    const save = vi.fn().mockResolvedValue(result);
    const overlay = createOverlay({ rows: 10, save });

    overlay.input(ENTER, DOWN, ENTER, CTRL_S);
    await vi.waitFor(() =>
      expect(topBorder(overlay.component.render(42))).toContain(
        "Write Config To",
      ),
    );
    overlay.input(ENTER);
    await vi.waitFor(() =>
      expect(stripAnsi(overlay.component.render(42).join("\n"))).toContain(
        expected,
      ),
    );

    const lines = overlay.component.render(42);

    expect(save).toHaveBeenCalledWith("project", { "themes.light": "dark" });
    expect(lines.length).toBeLessThanOrEqual(overlayMaxHeight(10));
    expect(lines.join("\n")).toContain(style);
    expect(stripAnsi(lines.at(-1) ?? "").startsWith("└")).toBe(true);
  },
);

test("shows a dim busy line in place of the hints while it resolves paths and saves", async () => {
  let finishPaths!: (paths: { global: string; project: string }) => void;
  const resolvePaths = vi.fn(
    () =>
      new Promise<{ global: string; project: string }>((resolve) => {
        finishPaths = resolve;
      }),
  );
  let finishSave!: (value: { ok: true }) => void;
  const save = vi.fn(
    () =>
      new Promise<{ ok: true }>((resolve) => {
        finishSave = resolve;
      }),
  );
  const overlay = createOverlay({ resolvePaths, save });

  overlay.input(CTRL_S);

  let lines = overlay.component.render(58);

  expect(footerLines(lines)).toEqual(["Resolving configuration paths…"]);
  expect(lines.join("\n")).toContain(
    "\x1b[90mResolving configuration paths…\x1b[39m",
  );

  finishPaths({ global: "/user.json", project: "/project.json" });
  await vi.waitFor(() =>
    expect(topBorder(overlay.component.render(58))).toContain(
      "Write Config To",
    ),
  );
  overlay.input(ENTER);
  lines = overlay.component.render(58);
  expect(footerLines(lines)).toEqual(["Saving configuration…"]);
  expect(lines.join("\n")).toContain("\x1b[90mSaving configuration…\x1b[39m");

  finishSave({ ok: true });
  await vi.waitFor(() =>
    expect(stripAnsi(overlay.component.render(58).join("\n"))).toContain(
      "No changes to save.",
    ),
  );
  lines = overlay.component.render(58);
  expect(lines.join("\n")).toContain("\x1b[37m  No changes to save.\x1b[39m");
  expect(footerText(lines)).toContain("Esc Close");
});

test("renders a path failure inline in the error color", async () => {
  const failed = createOverlay({
    resolvePaths: vi.fn().mockRejectedValue(new Error("permission denied")),
  });

  failed.input(CTRL_S);
  await vi.waitFor(() => {
    const rendered = stripAnsi(failed.component.render(60).join("\n"));

    expect(rendered).toContain("Could not resolve the configuration paths:");
    expect(rendered).toContain("denied.");
  });
  expect(failed.component.render(60).join("\n")).toContain("\x1b[31m");
});

function assertFrame(lines: string[], title: string, width: number): void {
  const plain = lines.map((line) => stripAnsi(line));

  expect(plain[0]).toMatch(new RegExp(`^┌─ ${title} ─+┐$`));
  expect(plain.at(-1)).toMatch(/^└─+┘$/);
  expect(plain.filter((line) => line.startsWith("├"))).toHaveLength(1);
  expect(findOverflowingLines(lines, width)).toEqual([]);
  expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
}

/** Body rows without borders or padding. */
function bodyLines(lines: readonly string[]): string[] {
  const rule = lines.findIndex((line) => stripAnsi(line).startsWith("├"));

  return lines
    .slice(1, rule)
    .map((line) => stripAnsi(line).slice(2, -2).trimEnd());
}

function createOverlay(
  overrides: {
    keybindings?: KeybindingsConfig;
    resolvePaths?: () => Promise<{ global: string; project: string }>;
    rows?: number;
    save?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
    themeNames?: string[];
  } = {},
) {
  const done = vi.fn();
  const requestRender = vi.fn();
  const resolvePaths =
    overrides.resolvePaths ??
    vi.fn().mockResolvedValue({
      global: "/a/very/long/global/configuration/path/settings.json",
      project: "/a/very/long/project/configuration/path/settings.json",
    });
  const save = overrides.save ?? vi.fn().mockResolvedValue({ ok: true });
  const component = new ConfigOverlayComponent({
    config,
    done,
    keybindings: createPiKeybindings(overrides.keybindings),
    requestRender,
    resolvePaths,
    save,
    terminalRows: () => overrides.rows ?? 30,
    theme,
    themeNames: overrides.themeNames ?? ["light", "dark", "界-wide-theme"],
  });

  return {
    component,
    done,
    input: (...keys: string[]) => {
      for (const key of keys) component.handleInput(key);
    },
    resolvePaths,
    save,
  };
}

/** Footer lines without borders, padding, or styling. */
function footerLines(lines: readonly string[]): string[] {
  const rule = lines.findIndex((line) => stripAnsi(line).startsWith("├"));

  return lines
    .slice(rule + 1, -1)
    .map((line) => stripAnsi(line).slice(2, -2).trimEnd());
}

/** The footer hints on one line, however they wrapped. */
function footerText(lines: readonly string[]): string {
  return footerLines(lines).join(" · ");
}

/** The body row carrying a selection marker. */
function selectedRow(lines: readonly string[]): string {
  return bodyLines(lines).find((line) => /^[▌→]/.test(line)) ?? "";
}

function topBorder(lines: readonly string[]): string {
  return lines[0] ?? "";
}
