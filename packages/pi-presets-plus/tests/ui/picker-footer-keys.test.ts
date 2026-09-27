/**
 * Covers the picker footer, which wraps between hints so every key stays
 * visible, the picker height it leaves for the list, and closing the
 * picker through Pi's keybindings.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import { stripAnsi } from "../helpers/ansi.js";
import { piKeybindings } from "../helpers/keybindings.js";
import { makeLoadedPreset } from "../helpers/picker.js";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import {
  createFakeCustom,
  createFakeTui,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAll = vi.fn();

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return { ...actual, loadAll };
});

const { openPicker } = await import("../../src/ui/picker.js");

/** Hints the picker spec requires in the list-mode footer. */
const REQUIRED_HINTS = [
  "⏎ Activate",
  "/ Filter",
  "↑/↓ Move",
  "PgUp/PgDn Page",
  "←/→ Scope",
  "s Status",
  "Esc Close",
];

interface OpenedPicker {
  /** Lines rendered before any key was sent. */
  readonly lines: string[];
  readonly result: Promise<unknown>;
}

/** Footer rows: the dim lines between the last rule and the bottom border. */
function footerRows(lines: readonly string[]): string[] {
  const plain = lines.map(stripAnsi);
  const lastRule = plain.map((line) => line.startsWith("├")).lastIndexOf(true);

  return plain.slice(lastRule + 1, -1);
}

/**
 * Opens the picker over twelve presets, renders it at `width`, and sends
 * `keys`. With `closeAfterKeys`, the test closes the overlay itself.
 */
function open(
  options: {
    readonly closeAfterKeys?: boolean;
    readonly keybindings?: KeybindingsManager;
    readonly keys?: readonly string[];
    readonly rows?: number;
    readonly width?: number;
  } = {},
): OpenedPicker {
  const rendered: string[] = [];
  const ctx = {
    getActiveTools: () => [],
    ui: {
      custom: createFakeCustom({
        keybindings: options.keybindings ?? piKeybindings(),
        keys: options.keys ?? [],
        onMount: (_picker, done) => {
          if (options.closeAfterKeys) done(undefined);
        },
        rendered,
        tui: createFakeTui(options.width ?? 80, options.rows ?? 40).tui,
        width: options.width ?? 80,
      }),
      notify: vi.fn(),
      setStatus: vi.fn(),
    },
  } as unknown as Parameters<typeof openPicker>[0];
  const result = openPicker(ctx, {
    hotkeys: new HotkeyRegistry(),
    onActivate: vi.fn().mockResolvedValue({ ok: true }),
    session: new ActivePresetSession(),
  });

  return { lines: rendered, result };
}

beforeEach(() => {
  loadAll.mockReset();
  loadAll.mockResolvedValue({
    presets: Array.from({ length: 12 }, (_, index) =>
      makeLoadedPreset(`preset-${index}`),
    ),
    warnings: [],
  });
});

describe("picker footer", () => {
  it.each([64, 80, 100])(
    "wraps between hints so every required hint shows at width %i",
    async (width) => {
      const { lines, result } = open({ closeAfterKeys: true, width });

      await result;

      const footer = footerRows(lines);

      expect(footer.length).toBeGreaterThan(1);

      for (const hint of REQUIRED_HINTS) {
        expect(footer.some((row) => row.includes(hint))).toBe(true);
      }

      expect(footer.join("\n")).not.toContain("…");
    },
  );

  it("keeps the wrapped picker inside its 80% overlay height", async () => {
    const { lines, result } = open({ closeAfterKeys: true, rows: 30 });

    await result;

    expect(lines.length).toBeLessThanOrEqual(24);
    expect(stripAnsi(lines.at(-1) ?? "")).toMatch(/^└─+┘$/);
  });
});

describe("picker keys", () => {
  it("closes on Ctrl+C, which Pi binds to cancel", async () => {
    await expect(open({ keys: ["\u0003"] }).result).resolves.toBeUndefined();
  });

  it("closes on a key the user remapped to cancel", async () => {
    const keybindings = piKeybindings({ "tui.select.cancel": "ctrl+g" });

    await expect(
      open({ keybindings, keys: ["\u0007"] }).result,
    ).resolves.toBeUndefined();
  });
});
