/**
 * Covers the read-only info dialog: the color each tone gives the title,
 * dismissal through Pi's keybindings, body wrapping at a narrow width, and
 * scrolling a body taller than the overlay.
 */
import { openInfoDialog } from "../../src/ui/info-dialog.js";
import { stripAnsi } from "../helpers/ansi.js";
import { piKeybindings } from "../helpers/keybindings.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import {
  createFakeCustom,
  createFakeTui,
  createPlainTheme,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it } from "vitest";

/** Color names the theme was asked for while rendering a dialog. */
const coloredCalls: string[] = [];
/** Theme that tags styled text so assertions can read tone and emphasis. */
const theme = {
  bold: (text: string) => `<b>${text}</b>`,
  fg: (name: string, text: string) => {
    coloredCalls.push(name);

    return `<${name}>${text}</${name}>`;
  },
} as Theme;

beforeEach(() => {
  coloredCalls.length = 0;
});

interface InfoDialogHarness {
  readonly ctx: Parameters<typeof openInfoDialog>[0];
  readonly rendered: string[];
}

/** Opens an info dialog, records its lines, and feeds it one keypress. */
function makeInfoDialogHarness(
  input = "\r",
  width = 48,
  keybindings: KeybindingsManager = piKeybindings(),
): InfoDialogHarness {
  const rendered: string[] = [];
  const ctx = {
    ui: {
      custom: createFakeCustom({
        keybindings,
        keys: [input],
        rendered,
        theme,
        width,
      }),
    },
  } as unknown as Parameters<typeof openInfoDialog>[0];

  return { ctx, rendered };
}

/** Line count of a body that overflows a 20-row terminal's dialog. */
const LONG_BODY = Array.from({ length: 40 }, (_, index) => `line ${index}`);

/**
 * Opens an info dialog on a short terminal, feeds it `keys`, and returns
 * the lines it renders afterwards, before closing it.
 */
async function renderAfterKeys(
  keys: readonly string[],
  rows = 20,
): Promise<string[]> {
  let lines: string[] = [];
  const ctx = {
    ui: {
      custom: createFakeCustom({
        keybindings: piKeybindings(),
        keys,
        // Pi renders an overlay before it receives input.
        rendered: [],
        onMount: (component, done) => {
          lines = component.render(48).map(stripAnsi);
          done(undefined);
        },
        theme: createPlainTheme(),
        tui: createFakeTui(80, rows).tui,
        width: 48,
      }),
    },
  } as unknown as Parameters<typeof openInfoDialog>[0];

  await openInfoDialog(ctx, { body: LONG_BODY.join("\n"), title: "Title" });

  return lines;
}

describe("openInfoDialog", () => {
  it.each([
    ["info", "accent"],
    ["warning", "warning"],
    ["error", "error"],
  ] as const)("renders %s tone title styling", async (tone, color) => {
    await openInfoDialog(makeInfoDialogHarness().ctx, {
      body: "body",
      title: "Title",
      tone,
    });

    expect(coloredCalls).toContain(color);
  });

  it("dismisses on Enter", async () => {
    await expect(
      openInfoDialog(makeInfoDialogHarness("\r").ctx, {
        body: "body",
        title: "Title",
      }),
    ).resolves.toBeUndefined();
  });

  it("dismisses on Esc", async () => {
    await expect(
      openInfoDialog(makeInfoDialogHarness("\u001B").ctx, {
        body: "body",
        title: "Title",
      }),
    ).resolves.toBeUndefined();
  });

  it("dismisses on Ctrl+C, which Pi binds to cancel", async () => {
    await expect(
      openInfoDialog(makeInfoDialogHarness("\u0003").ctx, {
        body: "body",
        title: "Title",
      }),
    ).resolves.toBeUndefined();
  });

  it("dismisses on a key the user remapped to cancel", async () => {
    await expect(
      openInfoDialog(
        makeInfoDialogHarness(
          "q",
          48,
          piKeybindings({ "tui.select.cancel": "q" }),
        ).ctx,
        { body: "body", title: "Title" },
      ),
    ).resolves.toBeUndefined();
  });

  it("fits a tall body in the overlay height and keeps footer and border", async () => {
    const lines = await renderAfterKeys([]);

    // 90% of 20 rows is 18, and the margin of 2 leaves 16.
    expect(lines).toHaveLength(16);
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
    expect(lines.at(-2)).toContain("Press Enter or Esc to dismiss");
    expect(lines.join("\n")).toContain("↑/↓ Scroll");
    expect(lines[3]).toContain("line 0");
    expect(lines.join("\n")).toContain("↓│");
  });

  it("scrolls the body with the down and page-down keys", async () => {
    const lines = await renderAfterKeys(["\u001B[B", "\u001B[6~"]);

    // One line down, then one page of the nine body rows that fit.
    expect(lines[3]).toContain("line 10");
    expect(lines[3]).toContain("↑│");
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
  });

  it("stops scrolling at the end of the body", async () => {
    const lines = await renderAfterKeys(Array(60).fill("\u001B[B"));

    expect(lines.join("\n")).toContain("line 39");
    expect(lines.join("\n")).not.toContain("↓│");
  });

  it("wraps multi-line bodies at narrow width", async () => {
    const harness = makeInfoDialogHarness("\r", 16);

    await openInfoDialog(harness.ctx, {
      body: "alpha beta gamma\ndelta epsilon",
      title: "Title",
    });

    expect(harness.rendered.join("\n")).toContain("alpha beta");
    expect(harness.rendered.join("\n")).toContain("gamma");
    expect(harness.rendered.join("\n")).toContain("delta");
    expect(harness.rendered.join("\n")).toContain("epsilon");
  });
});
