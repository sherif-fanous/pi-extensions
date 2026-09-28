/** Drives the real slice picker component through its focused input handler. */

import type { SliceCandidate } from "../../src/slice.js";
import {
  showEndPicker,
  showStartPicker,
  type PickerResult,
} from "../../src/ui/picker.js";
import type {
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import {
  createFakeContext,
  createFakeCustom,
  createFakeKeybindings,
  createMarkerTheme,
  createPiKeybindings,
  findOverflowingLines,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

const CANDIDATES: SliceCandidate[] = [
  {
    id: "u1",
    ordinal: 1,
    text: "first",
    timestamp: "2026-03-10T12:00:00.000Z",
    total: 2,
  },
  {
    id: "u2",
    ordinal: 2,
    text: "second",
    timestamp: "2026-03-10T12:01:00.000Z",
    total: 2,
  },
];

const KEYBINDINGS = createFakeKeybindings({
  "tui.select.cancel": "escape",
  "tui.select.confirm": "enter",
  "tui.select.down": "down",
  "tui.select.pageDown": "pgdn",
  "tui.select.pageUp": "pgup",
  "tui.select.up": "up",
});

/** Twelve messages, more than the picker shows at once. */
const MANY_CANDIDATES: SliceCandidate[] = Array.from(
  { length: 12 },
  (_, index) => ({
    id: `u${index + 1}`,
    ordinal: index + 1,
    text: `message ${index + 1}`,
    timestamp: new Date().toISOString(),
    total: 12,
  }),
);

const THEME = {
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  fg: (_color: string, text: string) => text,
} as Theme;

/** Where to record the lines the picker renders before it receives keys. */
interface PickerRender {
  readonly keybindings?: KeybindingsManager;
  readonly lines: string[];
  readonly theme?: Theme;
  readonly width: number;
}

async function drivePicker(
  keys: readonly string[],
  invoke: (ui: ExtensionUIContext) => Promise<PickerResult>,
  render?: PickerRender,
): Promise<PickerResult> {
  let finished = false;
  const custom = createFakeCustom({
    keybindings: render?.keybindings ?? KEYBINDINGS,
    keys,
    onDone: () => {
      finished = true;
    },
    onMount: () => {
      if (!finished) throw new Error("The picker did not finish.");
    },
    rendered: render?.lines,
    theme: render?.theme ?? THEME,
    width: render?.width,
  });

  return invoke(createFakeContext({ ui: { custom } }).ui);
}

describe("slice picker input", () => {
  it("wraps downward from the latest start message", async () => {
    const result = await drivePicker(["down", "enter"], (ui) =>
      showStartPicker(ui, CANDIDATES),
    );

    expect(result).toEqual({ id: "u1", kind: "message" });
  });

  it("wraps upward from the default end option", async () => {
    const result = await drivePicker(["up", "enter"], (ui) =>
      showEndPicker(ui, CANDIDATES, 1),
    );

    expect(result).toEqual({ id: "u2", kind: "message" });
  });

  it("selects a message after the default end option", async () => {
    const result = await drivePicker(["down", "enter"], (ui) =>
      showEndPicker(ui, CANDIDATES, 1),
    );

    expect(result).toEqual({ id: "u2", kind: "message" });
  });

  it("selects the preselected end default with Enter", async () => {
    const result = await drivePicker(["enter"], (ui) =>
      showEndPicker(ui, CANDIDATES, 1),
    );

    expect(result).toEqual({ kind: "end" });
  });

  it("cancels when the focused component receives Escape", async () => {
    const result = await drivePicker(["escape"], (ui) =>
      showStartPicker(ui, CANDIDATES),
    );

    expect(result).toEqual({ kind: "cancel" });
  });

  // On a 40-row terminal at width 80 the picker shows 7 messages, so a page
  // is 7 messages.
  it("moves up one page with PgUp", async () => {
    const result = await drivePicker(
      ["pgup", "enter"],
      (ui) => showStartPicker(ui, MANY_CANDIDATES),
      { lines: [], width: 80 },
    );

    expect(result).toEqual({ id: "u2", kind: "message" });
  });

  it("stops PgUp at the first message instead of wrapping", async () => {
    const result = await drivePicker(
      ["pgup", "pgup", "pgup", "enter"],
      (ui) => showStartPicker(ui, MANY_CANDIDATES),
      { lines: [], width: 80 },
    );

    expect(result).toEqual({ id: "u1", kind: "message" });
  });

  it("moves down one page with PgDn and stops at the last message", async () => {
    const onePage = await drivePicker(
      ["pgdn", "enter"],
      (ui) => showEndPicker(ui, MANY_CANDIDATES, 1),
      { lines: [], width: 80 },
    );
    const pastTheEnd = await drivePicker(
      ["pgdn", "pgdn", "pgdn", "enter"],
      (ui) => showEndPicker(ui, MANY_CANDIDATES, 1),
      { lines: [], width: 80 },
    );

    expect(onePage).toEqual({ id: "u11", kind: "message" });
    expect(pastTheEnd).toEqual({ id: "u12", kind: "message" });
  });

  it("follows a remapped cancel key instead of Escape", async () => {
    const lines: string[] = [];
    const result = await drivePicker(
      ["\x1b", "\r"],
      (ui) => showStartPicker(ui, CANDIDATES),
      {
        keybindings: createPiKeybindings({ "tui.select.cancel": "ctrl+q" }),
        lines,
        width: 80,
      },
    );

    const remapped = await drivePicker(
      ["\x11"],
      (ui) => showStartPicker(ui, CANDIDATES),
      {
        keybindings: createPiKeybindings({ "tui.select.cancel": "ctrl+q" }),
        lines: [],
        width: 80,
      },
    );

    expect(result).toEqual({ id: "u2", kind: "message" });
    expect(remapped).toEqual({ kind: "cancel" });
    expect(lines).toContain(
      " ↑/↓ Move · PgUp/PgDn Page · Enter Select · Ctrl+Q Cancel",
    );
  });
});

describe("slice picker rendering", () => {
  it("renders two-line rows with an arrow, a bold selection, and metadata", async () => {
    const lines: string[] = [];

    await drivePicker(["escape"], (ui) => showStartPicker(ui, CANDIDATES), {
      lines,
      width: 40,
    });

    const selectedIndex = lines.indexOf("→ \x1b[1msecond\x1b[22m");

    expect(selectedIndex).toBeGreaterThanOrEqual(0);
    expect(lines[selectedIndex + 1]).toContain("Message 2 of 2");
    expect(lines).toContain("  first");
  });

  it("colors the title, marker, border, position, and key hints by meaning", async () => {
    const lines: string[] = [];

    await drivePicker(
      ["escape"],
      (ui) => showStartPicker(ui, MANY_CANDIDATES),
      { lines, theme: createMarkerTheme(), width: 80 },
    );

    expect(lines.map((line) => line.trimEnd())).toContain(
      " <accent><b>Slice: Start at Message</b></accent>",
    );
    expect(lines).toContain("<accent>→ </accent><b>message 12</b>");
    expect(lines).toContain(`<border>${"─".repeat(80)}</border>`);
    expect(lines).toContain("<muted>  (12/12)</muted>");
    expect(lines).toContain(
      " <dim>↑/↓ Move · PgUp/PgDn Page · Enter Select · Esc Cancel</dim>",
    );
  });

  it("titles the end picker in Title Case", async () => {
    const lines: string[] = [];

    await drivePicker(["escape"], (ui) => showEndPicker(ui, CANDIDATES, 1), {
      lines,
      width: 80,
    });

    expect(lines.map((line) => stripAnsi(line).trimEnd())).toContain(
      " Slice: End Before Message",
    );
  });

  it("ends with the key hints and the bottom border", async () => {
    const lines: string[] = [];

    await drivePicker(["escape"], (ui) => showStartPicker(ui, CANDIDATES), {
      lines,
      width: 80,
    });

    expect(lines.slice(-3)).toEqual([
      " ↑/↓ Move · PgUp/PgDn Page · Enter Select · Esc Cancel",
      "",
      "─".repeat(80),
    ]);
  });

  it("shows at most ten messages on a tall terminal", async () => {
    const candidates: SliceCandidate[] = Array.from(
      { length: 30 },
      (_, index) => ({
        id: `u${index + 1}`,
        ordinal: index + 1,
        text: `message ${index + 1}`,
        timestamp: new Date().toISOString(),
        total: 30,
      }),
    );
    const lines: string[] = [];

    await drivePicker(["escape"], (ui) => showStartPicker(ui, candidates), {
      lines,
      width: 80,
    });

    expect(lines.filter((line) => line.includes("Message ")).length).toBe(10);
  });

  it("renders a scroll indicator at a fixed width", async () => {
    const lines: string[] = [];

    await drivePicker(
      ["escape"],
      (ui) => showStartPicker(ui, MANY_CANDIDATES),
      {
        lines,
        width: 36,
      },
    );

    expect(lines).toContain("  (12/12)");
  });

  it("renders the editor hint for an end-message row", async () => {
    const lines: string[] = [];

    await drivePicker(["escape"], (ui) => showEndPicker(ui, CANDIDATES, 1), {
      lines,
      width: 60,
    });

    expect(lines.some((line) => line.includes("goes to your editor"))).toBe(
      true,
    );
  });

  it("shows only the default when the start is the last user message", async () => {
    const lines: string[] = [];
    const result = await drivePicker(
      ["enter"],
      (ui) => showEndPicker(ui, CANDIDATES, 2),
      { lines, width: 50 },
    );

    expect(result).toEqual({ kind: "end" });
    expect(
      lines.some((line) => line.includes("Keep everything to the end")),
    ).toBe(true);

    expect(lines.some((line) => line.includes("goes to your editor"))).toBe(
      false,
    );
  });

  it("renders 130-minute and older-than-seven-day timestamps", async () => {
    const now = Date.now();
    const oldTimestamp = new Date(now - 8 * 24 * 60 * 60_000);
    const expectedDate = new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
    }).format(oldTimestamp);
    const candidates: SliceCandidate[] = [
      {
        id: "recent",
        ordinal: 1,
        text: "recent",
        timestamp: new Date(now - 130 * 60_000).toISOString(),
        total: 2,
      },
      {
        id: "old",
        ordinal: 2,
        text: "old",
        timestamp: oldTimestamp.toISOString(),
        total: 2,
      },
    ];
    const lines: string[] = [];

    await drivePicker(["escape"], (ui) => showStartPicker(ui, candidates), {
      lines,
      width: 50,
    });

    expect(lines.some((line) => line.includes("2h ago"))).toBe(true);
    expect(lines.some((line) => line.includes(expectedDate))).toBe(true);
  });

  describe.each([20, 30, 40])("at width %i", (width) => {
    const candidates: SliceCandidate[] = Array.from(
      { length: 12 },
      (_, index) => ({
        id: `u${index + 1}`,
        ordinal: index + 1,
        text: `a long message that cannot fit on one narrow line ${index + 1}`,
        timestamp: new Date().toISOString(),
        total: 12,
      }),
    );

    it("fits every start picker line", async () => {
      const lines: string[] = [];

      await drivePicker(["escape"], (ui) => showStartPicker(ui, candidates), {
        lines,
        width,
      });

      expect(lines.some((line) => line.includes("(12/12)"))).toBe(true);
      expect(findOverflowingLines(lines, width)).toEqual([]);
    });

    it("fits every end picker line", async () => {
      const lines: string[] = [];

      await drivePicker(["escape"], (ui) => showEndPicker(ui, candidates, 1), {
        lines,
        width,
      });

      expect(lines.some((line) => line.includes("(1/12)"))).toBe(true);
      expect(findOverflowingLines(lines, width)).toEqual([]);
    });

    it("wraps the key hints without cutting any of them", async () => {
      const lines: string[] = [];

      // The marker theme tags the hint lines; wrapping measures the hints
      // before they are styled, so the markers do not change the layout.
      await drivePicker(["escape"], (ui) => showEndPicker(ui, candidates, 1), {
        lines,
        theme: createMarkerTheme(),
        width,
      });

      const hints = lines
        .filter((line) => line.startsWith(" <dim>"))
        .flatMap((line) =>
          line.replace(" <dim>", "").replace("</dim>", "").split(" · "),
        );

      expect(hints).toEqual([
        "↑/↓ Move",
        "PgUp/PgDn Page",
        "Enter Select",
        "Esc Cancel",
      ]);
    });

    it("truncates with a single-character ellipsis", async () => {
      const lines: string[] = [];

      await drivePicker(["escape"], (ui) => showEndPicker(ui, candidates, 1), {
        lines,
        width,
      });

      expect(lines.some((line) => line.includes("…"))).toBe(true);
      expect(lines.some((line) => line.includes("..."))).toBe(false);
    });
  });
});
