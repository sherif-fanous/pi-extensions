/**
 * Covers how the preset editor fits its overlay: the title in the top
 * border, the footer wrapping between hints, a form taller than the
 * overlay keeping its buttons, footer, and border while it scrolls to the
 * focused row, every line fitting a narrow width, the tools row wrapping
 * so every tool stays visible, the busy line while a save runs, and Pi's
 * keybindings, remaps included.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset } from "../../src/types.js";
import type { Component, KeybindingsManager } from "@earendil-works/pi-tui";
import { overlayOptions } from "@sherif-fanous/pi-extensions-core";
import {
  createDeferred,
  createFakeCustom,
  createFakeTui,
  createPiKeybindings,
  findOverflowingLines,
  flushPromises,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updatePreset = vi.fn();

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return { ...actual, updatePreset };
});

const { openEditor } = await import("../../src/ui/editor.js");

const seed: LoadedPreset = {
  hotkey: "ctrl+alt+p",
  instructions: "Plan before you write code.",
  model: "claude-opus-4.5",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};

/** Tool names long enough to need several lines at a narrow width. */
const TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
  "web_search",
  "fetch_content",
];

/** Row indexes in the editor's focus order. */
const TOOLS_ROW = 5;
const PROMPT_ROW = 6;

interface OpenedEditor {
  readonly custom: ReturnType<typeof vi.fn>;
  readonly editor: Component;
  readonly promptEditor: ReturnType<typeof vi.fn>;
  readonly result: Promise<unknown>;
}

function focusRow(editor: Component, row: number): void {
  for (let index = 0; index < row; index++) editor.handleInput?.("\t");
}

/** Footer rows: the lines between the last rule and the bottom border. */
function footerRows(lines: readonly string[]): string[] {
  const lastRule = lines.map((line) => line.startsWith("├")).lastIndexOf(true);

  return lines.slice(lastRule + 1, -1);
}

/**
 * Open the editor on `seed` in a terminal `rows` tall and send `keys`.
 * The editor stays open unless a key closes it.
 */
async function open(
  options: {
    readonly keybindings?: KeybindingsManager;
    readonly keys?: readonly string[];
    readonly rows?: number;
  } = {},
): Promise<OpenedEditor> {
  let editor: Component | undefined;
  const promptEditor = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    modelRegistry: {
      getAll: () => [{ id: seed.model, provider: seed.provider }],
      hasConfiguredAuth: () => true,
    },
    ui: {
      custom: vi.fn(
        createFakeCustom({
          keybindings: options.keybindings ?? createPiKeybindings(),
          keys: options.keys ?? [],
          onMount: (mounted) => {
            editor = mounted;
          },
          tui: createFakeTui(80, options.rows ?? 40).tui,
        }),
      ),
      editor: promptEditor,
    },
  };
  const result = openEditor(
    ctx as never,
    { mode: "edit", seed, target: seed },
    {
      onTest: vi.fn().mockResolvedValue({ ok: false }),
      pi: {
        appendEntry: vi.fn(),
        getActiveTools: () => [],
        getAllTools: () => TOOLS.map((name) => ({ name })) as never,
        getThinkingLevel: () => "off",
      },
      presets: [seed],
      session: new ActivePresetSession(),
    },
  );

  await Promise.resolve();

  if (!editor) throw new Error("Editor was not created.");

  return { custom: ctx.ui.custom, editor, promptEditor, result };
}

function render(editor: Component, width: number): string[] {
  return editor.render(width).map(stripAnsi);
}

beforeEach(() => {
  updatePreset.mockReset();
});

describe("editor layout", () => {
  it("opens as a main overlay", async () => {
    const { custom } = await open();

    expect(custom.mock.calls[0]?.[1]).toMatchObject({
      overlay: true,
      overlayOptions: overlayOptions("main"),
    });
  });

  it("draws the title in the top border", async () => {
    const { editor } = await open();

    expect(render(editor, 80)[0]).toMatch(/^┌─ Edit "plan" ─+┐$/);
  });

  it("wraps the footer so Ctrl+T Test and Esc Cancel stay visible at 40 columns", async () => {
    const { editor } = await open();
    const footer = footerRows(render(editor, 40)).join("\n");

    expect(footer).toContain("Ctrl+T Test");
    expect(footer).toContain("Esc Cancel");
    expect(footer).not.toContain("…");
  });

  it("fits a short terminal and keeps the buttons, footer, and border", async () => {
    const { editor } = await open({ rows: 16 });
    const lines = render(editor, 100);

    // 80% of 16 rows is 12.
    expect(lines).toHaveLength(12);
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
    expect(lines.join("\n")).toContain("Actions");
    expect(lines.join("\n")).toContain("Esc Cancel");
    expect(lines.join("\n")).toContain("↓ │");
  });

  it("scrolls the form to keep the focused row visible", async () => {
    const { editor } = await open({ rows: 16 });

    expect(render(editor, 100).join("\n")).not.toContain("Hotkey");

    focusRow(editor, 7);

    const lines = render(editor, 100);

    expect(lines.join("\n")).toContain("Hotkey");
    expect(lines.join("\n")).toContain("↑ │");
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
  });

  it.each([40, 30])(
    "fits every line on every row at width %i",
    async (width) => {
      const { editor } = await open();

      for (let row = 0; row < 9; row++) {
        expect(findOverflowingLines(editor.render(width), width)).toEqual([]);
        editor.handleInput?.("\t");
      }
    },
  );

  it("shows the whole focused name field without cutting it off", async () => {
    const { editor } = await open();
    const nameLine = render(editor, 40).find((line) => line.includes("Name"));

    expect(nameLine).toContain("> plan");
    expect(nameLine).not.toContain("…");
  });

  it("wraps the tools and choice rows so every option stays visible at 40 columns", async () => {
    const { editor } = await open();

    focusRow(editor, TOOLS_ROW);
    // Switch from the session's tools to a picked list.
    editor.handleInput?.(" ");

    const text = render(editor, 40).join("\n");

    for (const tool of TOOLS) expect(text).toContain(`[ ] ${tool} `);

    for (const level of ["minimal", "xhigh", "max"]) {
      expect(text).toContain(`○ ${level} `);
    }

    expect(text).toContain("○ Test (apply");
    expect(text).toContain("temporarily)");
  });

  it("shows a busy line in place of the hints while the save runs", async () => {
    const save = createDeferred<{ ok: false; reason: string }>();

    updatePreset.mockReturnValue(save.promise);

    const { editor } = await open();

    editor.handleInput?.("\u0013");

    expect(footerRows(render(editor, 80))).toEqual([
      "│ Saving the preset…                                                           │",
    ]);

    save.resolve({ ok: false, reason: "Disk full." });
    await vi.waitFor(() => {
      expect(render(editor, 80).join("\n")).toContain("Esc Cancel");
    });
  });

  it("closes on Ctrl+C, which Pi binds to cancel", async () => {
    const { result } = await open({ keys: ["\u0003"] });

    await expect(result).resolves.toBeUndefined();
  });

  it("follows remapped keys instead of the defaults and names them in the footer", async () => {
    const keybindings = createPiKeybindings({
      "tui.select.cancel": "ctrl+g",
      "tui.select.confirm": "ctrl+o",
      "tui.select.down": "ctrl+n",
      "tui.select.up": "ctrl+p",
    });
    const { editor, promptEditor, result } = await open({ keybindings });
    const settled = vi.fn();

    void result.then(settled);

    // The default ↓ no longer moves; the remapped Ctrl+N does.
    editor.handleInput?.("\u001B[B");
    expect(render(editor, 100).find((line) => line.includes("▌"))).toContain(
      "Name",
    );
    for (let row = 0; row < PROMPT_ROW; row++) editor.handleInput?.("\u000E");

    const footer = footerRows(render(editor, 100)).join("\n");

    expect(footer).toContain("Tab/Ctrl+P/Ctrl+N Move");
    expect(footer).toContain("Ctrl+O Edit");
    expect(footer).toContain("Ctrl+G Cancel");

    // Enter and Esc do nothing; Ctrl+O opens the prompt editor.
    editor.handleInput?.("\r");
    editor.handleInput?.("\u001B");
    await Promise.resolve();
    expect(promptEditor).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();

    editor.handleInput?.("\u000F");
    await vi.waitFor(() => expect(promptEditor).toHaveBeenCalledOnce());
    // Let the prompt editor's cancel settle before the next key.
    await flushPromises();

    editor.handleInput?.("\u0007");
    await expect(result).resolves.toBeUndefined();
  });
});
