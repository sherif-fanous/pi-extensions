/**
 * Covers how the preset editor fits its overlay: the footer wraps between
 * hints instead of cutting them off, a form taller than the overlay keeps
 * its buttons, footer, and border and scrolls to the focused row, and Pi's
 * cancel keybinding closes it.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset } from "../../src/types.js";
import { openEditor } from "../../src/ui/editor.js";
import { stripAnsi } from "../helpers/ansi.js";
import { piKeybindings } from "../helpers/keybindings.js";
import type { Component } from "@earendil-works/pi-tui";
import {
  createFakeCustom,
  createFakeTui,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it, vi } from "vitest";

const seed: LoadedPreset = {
  hotkey: "ctrl+alt+p",
  instructions: "Plan before you write code.",
  model: "claude-opus-4.5",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};

interface OpenedEditor {
  readonly editor: Component;
  readonly result: Promise<unknown>;
}

/**
 * Opens the editor on `seed` in a terminal `rows` tall and sends `keys`.
 * The editor stays open unless a key closes it.
 */
async function open(
  options: { readonly keys?: readonly string[]; readonly rows?: number } = {},
): Promise<OpenedEditor> {
  let editor: Component | undefined;
  const ctx = {
    modelRegistry: {
      getAll: () => [{ id: seed.model, provider: seed.provider }],
      hasConfiguredAuth: () => true,
    },
    ui: {
      custom: createFakeCustom({
        keybindings: piKeybindings(),
        keys: options.keys ?? [],
        onMount: (mounted) => {
          editor = mounted;
        },
        tui: createFakeTui(80, options.rows ?? 40).tui,
      }),
    },
  };
  const result = openEditor(
    ctx as never,
    { mode: "edit", seed, target: seed },
    {
      onTest: vi.fn().mockResolvedValue({ ok: false }),
      presets: [seed],
      session: new ActivePresetSession(),
    },
  );

  await Promise.resolve();

  if (!editor) throw new Error("Editor was not created.");

  return { editor, result };
}

function render(editor: Component, width: number): string[] {
  return editor.render(width).map(stripAnsi);
}

describe("editor layout", () => {
  it("wraps the footer so Esc Cancel and ^T Test stay visible at 72 columns", async () => {
    const { editor } = await open();
    const lines = render(editor, 72);
    const footer = lines.slice(-4, -1).join("\n");

    expect(footer).toContain("^T Test");
    expect(footer).toContain("Esc Cancel");
    expect(footer).not.toContain("…");
  });

  it("fits a short terminal and keeps the buttons, footer, and border", async () => {
    const { editor } = await open({ rows: 16 });
    const lines = render(editor, 100);

    // The form needs 17 lines; 90% of 16 rows is 14, inside the margins.
    expect(lines).toHaveLength(14);
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
    expect(lines.join("\n")).toContain("Actions");
    expect(lines.join("\n")).toContain("Esc Cancel");
    expect(lines.join("\n")).toContain("↓│");
  });

  it("scrolls the form to keep the focused row visible", async () => {
    const { editor } = await open({ rows: 16 });

    expect(render(editor, 100).join("\n")).not.toContain("Hotkey");

    for (let index = 0; index < 7; index++) editor.handleInput?.("\t");

    const lines = render(editor, 100);

    expect(lines.join("\n")).toContain("Hotkey");
    expect(lines.join("\n")).toContain("↑│");
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
  });

  it("closes on Ctrl+C, which Pi binds to cancel", async () => {
    const { result } = await open({ keys: ["\u0003"] });

    await expect(result).resolves.toBeUndefined();
  });
});
