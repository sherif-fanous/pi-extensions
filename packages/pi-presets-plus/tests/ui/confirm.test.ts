/**
 * Covers the confirmation overlay: a golden rendering of the frame, prompt,
 * choices, and footer hint, choosing through Pi's keybindings, and fitting
 * a long message in the overlay height.
 */
import { openConfirm } from "../../src/ui/confirm.js";
import { stripAnsi } from "../helpers/ansi.js";
import { piKeybindings } from "../helpers/keybindings.js";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import {
  createFakeCustom,
  createFakeTui,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

interface ConfirmHarness {
  readonly ctx: Parameters<typeof openConfirm>[0];
  readonly rendered: string[];
}

/** Opens a confirmation overlay, records its lines, and feeds it `keys`. */
function makeConfirmHarness(
  keys: readonly string[] = ["n"],
  options: {
    readonly keybindings?: KeybindingsManager;
    readonly rows?: number;
    readonly width?: number;
  } = {},
): ConfirmHarness {
  const rendered: string[] = [];
  const ctx = {
    ui: {
      custom: createFakeCustom({
        keybindings: options.keybindings ?? piKeybindings(),
        keys,
        rendered,
        tui: createFakeTui(120, options.rows ?? 40).tui,
        width: options.width ?? 48,
      }),
    },
  } as unknown as Parameters<typeof openConfirm>[0];

  return { ctx, rendered };
}

describe("openConfirm", () => {
  it("renders the representative confirmation golden output", async () => {
    const harness = makeConfirmHarness();

    await openConfirm(
      harness.ctx,
      "Clear active preset?",
      "Clear managed settings?",
    );

    expect(harness.rendered).toEqual([
      "┌──────────────────────────────────────────────┐",
      "│             Clear active preset?             │",
      "│                                              │",
      "│  Clear managed settings?                     │",
      "│                                              │",
      "│                 ○ Yes   ● No                 │",
      "│ ←/→ choose · Enter confirm · Esc cancel      │",
      "└──────────────────────────────────────────────┘",
    ]);
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
    const keybindings = piKeybindings({ "tui.select.confirm": "ctrl+o" });

    await expect(
      openConfirm(
        makeConfirmHarness(["\u001B[D", "\u000F"], { keybindings }).ctx,
        "T",
        "M",
      ),
    ).resolves.toBe(true);
  });

  it("keeps the choices, footer, and border when the message is taller than the overlay", async () => {
    const harness = makeConfirmHarness(["n"], { rows: 20 });
    const message = Array.from({ length: 30 }, (_, i) => `line ${i}`).join(
      "\n",
    );

    await openConfirm(harness.ctx, "Title", message);

    const lines = harness.rendered.map(stripAnsi);

    // 50% of 20 rows is 10, inside the margin of 2 on each side.
    expect(lines).toHaveLength(10);
    expect(lines.join("\n")).toContain("○ Yes   ● No");
    expect(lines.join("\n")).toContain("Esc cancel");
    expect(lines.at(-1)).toMatch(/^└─+┘$/);
    expect(lines.join("\n")).toContain("↓│");
  });
});
