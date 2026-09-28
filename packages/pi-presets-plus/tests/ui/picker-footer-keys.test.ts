/**
 * Covers the picker frame: the footer, which wraps between hints so every
 * key stays visible and lists only the keys that work, the `(n/m)`
 * position, the empty states, the busy line, the picker height and width,
 * and moving and closing through Pi's keybindings, remaps included.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import { makeLoadedPreset } from "../helpers/picker.js";
import type { Component, KeybindingsManager } from "@earendil-works/pi-tui";
import { overlayOptions } from "@sherif-fanous/pi-extensions-core";
import {
  createDeferred,
  createFakeCustom,
  createFakeTui,
  createPiKeybindings,
  findOverflowingLines,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAll = vi.fn();
const reorderWithinScope = vi.fn();

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return { ...actual, loadAll, reorderWithinScope };
});

const { openPicker } = await import("../../src/ui/picker.js");

/** Hints the picker spec requires in the list-mode footer. */
const REQUIRED_HINTS = [
  "Enter Activate",
  "/ Filter",
  "↑/↓ Move",
  "PgUp/PgDn Page",
  "←/→ Scope",
  "s Status",
  "Esc Close",
];

interface OpenedPicker {
  readonly custom: ReturnType<typeof vi.fn>;
  /** Lines rendered before any key was sent. */
  readonly lines: string[];
  readonly onActivate: ReturnType<typeof vi.fn>;
  /** The mounted picker, once the overlay has opened. */
  readonly picker: () => Component;
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
  const onActivate = vi.fn().mockResolvedValue({ ok: true });
  let mounted: Component | undefined;
  const custom = vi.fn(
    createFakeCustom({
      keybindings: options.keybindings ?? createPiKeybindings(),
      keys: options.keys ?? [],
      onMount: (picker, done) => {
        mounted = picker;
        if (options.closeAfterKeys) done(undefined);
      },
      rendered,
      tui: createFakeTui(options.width ?? 80, options.rows ?? 40).tui,
      width: options.width ?? 80,
    }),
  );
  const ctx = {
    getActiveTools: () => [],
    ui: { custom, notify: vi.fn(), setStatus: vi.fn() },
  } as unknown as Parameters<typeof openPicker>[0];
  const result = openPicker(ctx, {
    hotkeys: new HotkeyRegistry(),
    onActivate,
    session: new ActivePresetSession(),
  });
  const picker = (): Component => {
    if (!mounted) throw new Error("Picker was not mounted.");

    return mounted;
  };

  return { custom, lines: rendered, onActivate, picker, result };
}

/** Presets `preset-0` to `preset-<count - 1>`, all in the user scope. */
function presets(count: number): LoadedPreset[] {
  return Array.from({ length: count }, (_, index) =>
    makeLoadedPreset(`preset-${index}`),
  );
}

/** The line carrying the selection marker, without styling. */
function selectedLine(component: Component, width = 80): string | undefined {
  return component
    .render(width)
    .map(stripAnsi)
    .find((line) => line.includes("▌"));
}

beforeEach(() => {
  loadAll.mockReset();
  reorderWithinScope.mockReset();
  loadAll.mockResolvedValue({ presets: presets(12), warnings: [] });
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

  it("opens as a main overlay", async () => {
    const { custom, result } = open({ closeAfterKeys: true });

    await result;

    expect(custom.mock.calls[0]?.[1]).toMatchObject({
      overlay: true,
      overlayOptions: overlayOptions("main"),
    });
  });

  it("names the filter mode's Enter and Esc for what they do", async () => {
    const opened = open({ keys: ["/"] });

    await vi.waitFor(() => opened.picker());

    const footer = footerRows(opened.picker().render(80)).join("\n");

    expect(footer).toContain("↑/↓ Move · PgUp/PgDn Page · ←/→ Cursor");
    expect(footer).toContain("Enter/Esc Back");
    expect(footer).not.toContain("Activate");
  });

  it("shows the position in the top border when not every preset fits", async () => {
    const { lines, picker } = open({ keys: ["\u001B[A"] });

    await vi.waitFor(() => picker());

    expect(stripAnsi(lines[0] ?? "")).toMatch(
      /^┌─ Presets Plus ─+ Scope: All · \(1\/12\) ─┐$/,
    );

    expect(stripAnsi(picker().render(80)[0] ?? "")).toMatch(
      /^┌─ Presets Plus ─+ Scope: All · \(12\/12\) ─┐$/,
    );
  });

  it("leaves the position out when every preset fits", async () => {
    loadAll.mockResolvedValue({ presets: presets(2), warnings: [] });

    const { lines, result } = open({ closeAfterKeys: true });

    await result;

    expect(stripAnsi(lines[0] ?? "")).toMatch(
      /^┌─ Presets Plus ─+ Scope: All ─┐$/,
    );
  });

  it("gives a new user the next step and leaves out keys that need a preset", async () => {
    loadAll.mockResolvedValue({ presets: [], warnings: [] });

    const { lines, result } = open({ closeAfterKeys: true });

    await result;

    const text = lines.map(stripAnsi).join("\n");

    expect(text).toContain("No presets yet. Press n to create one.");
    expect(footerRows(lines).join(" ")).toContain(
      "←/→ Scope · n New · c Clear · s Status · / Filter · Esc Close",
    );
    expect(text).not.toContain("Enter Activate");
    expect(text).not.toContain("e Edit");
  });

  it("says when the filter matches nothing", async () => {
    const { picker } = open({ keys: ["/", "z", "z", "z"] });

    await vi.waitFor(() => picker());

    expect(picker().render(80).map(stripAnsi).join("\n")).toContain(
      "No presets match this filter.",
    );
  });

  it("shows a busy line in place of the hints while a reorder runs", async () => {
    const reorder = createDeferred<{ ok: true }>();

    reorderWithinScope.mockReturnValue(reorder.promise);

    const { picker } = open({ keys: ["\u001B[1;5B"] });

    await vi.waitFor(() => picker());

    expect(footerRows(picker().render(80))).toEqual([
      "│ Reordering presets…                                                          │",
    ]);

    reorder.resolve({ ok: true });
    await vi.waitFor(() => {
      expect(footerRows(picker().render(80)).join("\n")).toContain("Esc Close");
    });
  });

  it.each([40, 30])("fits every line at width %i", async (width) => {
    const long = makeLoadedPreset(
      "a-preset-with-a-name-far-too-long-for-the-width",
    );

    loadAll.mockResolvedValue({ presets: [long, ...presets(3)], warnings: [] });

    const { lines, picker } = open({ width });

    await vi.waitFor(() => picker());

    expect(findOverflowingLines(lines, width)).toEqual([]);
    picker().handleInput?.("/");
    expect(findOverflowingLines(picker().render(width), width)).toEqual([]);
  });

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

  it("moves and activates only with the keys the user remapped", async () => {
    const keybindings = createPiKeybindings({
      "tui.select.confirm": "ctrl+o",
      "tui.select.down": "ctrl+n",
    });
    const { onActivate, picker } = open({ keybindings });

    await vi.waitFor(() => picker());

    // The default ↓ and Enter do nothing once remapped.
    picker().handleInput?.("\u001B[B");
    picker().handleInput?.("\r");
    expect(selectedLine(picker())).toContain("preset-0");
    expect(onActivate).not.toHaveBeenCalled();
    expect(footerRows(picker().render(80)).join("\n")).toContain(
      "Ctrl+O Activate",
    );

    picker().handleInput?.("\u000E");
    expect(selectedLine(picker())).toContain("preset-1");

    picker().handleInput?.("\u000F");
    await vi.waitFor(() =>
      expect(onActivate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "preset-1" }),
      ),
    );
  });

  it("closes on a key the user remapped to cancel", async () => {
    const keybindings = createPiKeybindings({ "tui.select.cancel": "ctrl+g" });

    await expect(
      open({ keybindings, keys: ["\u0007"] }).result,
    ).resolves.toBeUndefined();
  });
});
