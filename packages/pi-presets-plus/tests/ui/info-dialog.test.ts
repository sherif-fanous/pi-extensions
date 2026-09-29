/**
 * Covers the read-only info dialog: the frame and footer, closing through
 * Pi's keybindings, body wrapping at a narrow width, and scrolling a body
 * taller than the overlay.
 */
import { openInfoDialog } from "../../src/ui/info-dialog.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import { overlayOptions } from "@sherif-fanous/pi-extensions-core";
import {
  createFakeContext,
  createFakeCustom,
  createFakeTui,
  createMarkerTheme,
  createPiKeybindings,
  createPlainTheme,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it, vi } from "vitest";

interface InfoDialogHarness {
  readonly ctx: Parameters<typeof openInfoDialog>[0];
  readonly rendered: string[];
}

/** Open an info dialog, record its lines, and feed it one keypress. */
function makeInfoDialogHarness(
  input = "\r",
  width = 48,
  keybindings: KeybindingsManager = createPiKeybindings(),
  theme: Theme = createPlainTheme(),
): InfoDialogHarness {
  const rendered: string[] = [];
  const ctx = createFakeContext({
    ui: {
      custom: createFakeCustom({
        keybindings,
        keys: [input],
        rendered,
        theme,
        width,
      }),
    },
  });

  return { ctx, rendered };
}

/** Line count of a body that overflows a 20-row terminal's dialog. */
const LONG_BODY = Array.from({ length: 40 }, (_, index) => `line ${index}`);

/**
 * Open an info dialog on a short terminal, feed it `keys`, and return
 * the lines it renders afterwards, before closing it.
 */
async function renderAfterKeys(
  keys: readonly string[],
  rows = 20,
  keybindings: KeybindingsManager = createPiKeybindings(),
): Promise<string[]> {
  let lines: string[] = [];
  const ctx = createFakeContext({
    ui: {
      custom: createFakeCustom({
        keybindings,
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
  });

  await openInfoDialog(ctx, { body: LONG_BODY.join("\n"), title: "Title" });

  return lines;
}

describe("openInfoDialog", () => {
  it("draws the title in the top border and a close hint in the footer", async () => {
    const harness = makeInfoDialogHarness();

    await openInfoDialog(harness.ctx, {
      body: "No preset is active.",
      title: "Clear Unavailable",
    });

    expect(harness.rendered.map(stripAnsi)).toEqual([
      "┌─ Clear Unavailable ──────────────────────────┐",
      "│ No preset is active.                         │",
      "├──────────────────────────────────────────────┤",
      "│ Enter/Esc Close                              │",
      "└──────────────────────────────────────────────┘",
    ]);
  });

  it("draws the title bold accent and the border in the border color", async () => {
    const harness = makeInfoDialogHarness(
      "\r",
      48,
      createPiKeybindings(),
      createMarkerTheme(),
    );

    await openInfoDialog(harness.ctx, {
      body: "body",
      title: "Activation Failed",
    });

    expect(harness.rendered[0]).toContain(
      "<accent><b>Activation Failed</b></accent>",
    );
    expect(harness.rendered[0]).toContain("<border>┌─ </border>");
  });

  it("opens as a nested overlay", async () => {
    const custom = vi.fn(
      createFakeCustom({ keybindings: createPiKeybindings(), keys: ["\r"] }),
    );

    await openInfoDialog({ ui: { custom } } as never, {
      body: "body",
      title: "Title",
    });

    expect(custom.mock.calls[0]?.[1]).toEqual({
      overlay: true,
      overlayOptions: overlayOptions("nested"),
    });
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
          createPiKeybindings({ "tui.select.cancel": "q" }),
        ).ctx,
        { body: "body", title: "Title" },
      ),
    ).resolves.toBeUndefined();
  });

  it("offers Scroll and Page once the body is taller than the dialog", async () => {
    const lines = await renderAfterKeys([]);

    expect(lines.slice(-3, -1).map((line) => line.slice(2, -1).trim())).toEqual(
      ["↑/↓ Scroll · PgUp/PgDn Page", "Enter/Esc Close"],
    );
  });

  it("scrolls the body with the down and page-down keys", async () => {
    const lines = await renderAfterKeys(["\u001B[B", "\u001B[6~"]);

    // One line down, then one page of the eleven body rows that fit.
    expect(lines[1]).toContain("line 12");
    expect(lines[1]).toContain("↑ │");
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
  });

  it("names and follows the keys the user remapped, and ignores the defaults", async () => {
    const keybindings = createPiKeybindings({
      "tui.select.down": "ctrl+n",
      "tui.select.up": "ctrl+p",
    });
    const lines = await renderAfterKeys(
      ["\u001B[B", "\u000E", "\u000E"],
      20,
      keybindings,
    );

    expect(lines[1]).toContain("line 2");
    expect(lines.slice(-3, -1).join("\n")).toContain("Ctrl+P/Ctrl+N Scroll");
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
