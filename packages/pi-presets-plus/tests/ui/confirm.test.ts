/**
 * Covers the confirmation overlay: a golden rendering of the frame, prompt,
 * choices, and footer hint, choosing through Pi's keybindings, and fitting
 * a long message in the overlay height.
 */
import { openConfirm } from "../../src/ui/confirm.js";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import { overlayOptions } from "@sherif-fanous/pi-extensions-core";
import {
  createFakeContext,
  createFakeCustom,
  createFakeTui,
  createPiKeybindings,
  findOverflowingLines,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it, vi } from "vitest";

interface ConfirmHarness {
  readonly ctx: Parameters<typeof openConfirm>[0];
  readonly rendered: string[];
}

/** Open a confirmation overlay, record its lines, and feed it `keys`. */
function makeConfirmHarness(
  keys: readonly string[] = ["n"],
  options: {
    readonly keybindings?: KeybindingsManager;
    readonly rows?: number;
    readonly width?: number;
  } = {},
): ConfirmHarness {
  const rendered: string[] = [];
  const ctx = createFakeContext({
    ui: {
      custom: createFakeCustom({
        keybindings: options.keybindings ?? createPiKeybindings(),
        keys,
        rendered,
        tui: createFakeTui(120, options.rows ?? 40).tui,
        width: options.width ?? 48,
      }),
    },
  });

  return { ctx, rendered };
}

describe("openConfirm", () => {
  it("renders the representative confirmation golden output", async () => {
    const harness = makeConfirmHarness();

    await openConfirm(
      harness.ctx,
      "Clear Active Preset?",
      "Clear managed settings?",
    );

    expect(harness.rendered).toEqual([
      "┌─ Clear Active Preset? ───────────────────────┐",
      "│ Clear managed settings?                      │",
      "│                                              │",
      "│                 ○ Yes   ● No                 │",
      "├──────────────────────────────────────────────┤",
      "│ ←/→ Choose · Enter Confirm · y Yes · n No    │",
      "│ Esc Cancel                                   │",
      "└──────────────────────────────────────────────┘",
    ]);
  });

  it("leaves out the n hint when its choice repeats the cancel action", async () => {
    const harness = makeConfirmHarness(["n"], { width: 72 });

    await expect(
      openConfirm(harness.ctx, "Policy Override", "Activate it anyway?", {
        no: "Cancel",
        yes: "Override",
      }),
    ).resolves.toBe(false);

    const footer = harness.rendered.find((line) => line.includes("Choose"));

    expect(footer).toContain(
      "←/→ Choose · Enter Confirm · y Override · Esc Cancel",
    );
  });

  it("opens as a nested overlay", async () => {
    const custom = vi.fn(
      createFakeCustom({ keybindings: createPiKeybindings(), keys: ["n"] }),
    );

    await openConfirm({ ui: { custom } } as never, "T", "M");

    expect(custom.mock.calls[0]?.[1]).toEqual({
      overlay: true,
      overlayOptions: overlayOptions("nested"),
    });
  });

  it("confirms the selected choice with Enter", async () => {
    await expect(
      openConfirm(makeConfirmHarness(["\u001B[D", "\r"]).ctx, "T", "M"),
    ).resolves.toBe(true);
  });

  it("cancels on Ctrl+C, which Pi binds to cancel", async () => {
    await expect(
      openConfirm(makeConfirmHarness(["\u001B[D", "\u0003"]).ctx, "T", "M"),
    ).resolves.toBe(false);
  });

  it("confirms with a key the user remapped to confirm", async () => {
    const keybindings = createPiKeybindings({ "tui.select.confirm": "ctrl+o" });

    await expect(
      openConfirm(
        makeConfirmHarness(["\u001B[D", "\u000F"], { keybindings }).ctx,
        "T",
        "M",
      ),
    ).resolves.toBe(true);
  });

  it("ignores Enter and Esc once the user remapped confirm and cancel", async () => {
    const keybindings = createPiKeybindings({
      "tui.select.cancel": "ctrl+g",
      "tui.select.confirm": "ctrl+o",
    });
    const harness = makeConfirmHarness(["\r", "\u001B", "y"], {
      keybindings,
    });

    // No is selected, so Enter or Esc would resolve false; `y` decides.
    await expect(openConfirm(harness.ctx, "T", "M")).resolves.toBe(true);
    expect(harness.rendered.map(stripAnsi).slice(-3, -1)).toEqual([
      "│ ←/→ Choose · Ctrl+O Confirm · y Yes · n No   │",
      "│ Ctrl+G Cancel                                │",
    ]);
  });

  it("fits every line at a narrow width", async () => {
    const harness = makeConfirmHarness(["n"], { width: 30 });

    await openConfirm(
      harness.ctx,
      "Preset Doesn't Match Policy",
      "The access policy for this directory does not permit this preset.",
      { no: "Cancel", yes: "Override" },
    );

    expect(findOverflowingLines(harness.rendered, 30)).toEqual([]);
  });

  it("keeps the choices, footer, and border when the message is taller than the overlay", async () => {
    const harness = makeConfirmHarness(["n"], { rows: 20 });
    const message = Array.from({ length: 30 }, (_, i) => `line ${i}`).join(
      "\n",
    );

    await openConfirm(harness.ctx, "Title", message);

    const lines = harness.rendered.map(stripAnsi);

    // 80% of 20 rows is 16.
    expect(lines).toHaveLength(16);
    expect(lines.join("\n")).toContain("○ Yes   ● No");
    expect(lines.join("\n")).toContain("Esc Cancel");
    expect(lines.join("\n")).toContain("↑/↓ Scroll");
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
    expect(lines.join("\n")).toContain("↓ │");
  });
});
