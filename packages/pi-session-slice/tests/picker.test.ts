/** Drives the real slice picker component through its focused input handler. */

import {
  showEndPicker,
  showStartPicker,
  type PickerResult,
} from "../src/picker.js";
import type { SliceCandidate } from "../src/slice.js";
import type {
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeCustom,
  createFakeKeybindings,
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
  "tui.select.up": "up",
});

const THEME = {
  bold: (text: string) => `<b>${text}</b>`,
  fg: (_color: string, text: string) => text,
} as Theme;

/** Where to record the lines the picker renders before it receives keys. */
interface PickerRender {
  readonly lines: string[];
  readonly width: number;
}

async function drivePicker(
  keys: readonly string[],
  invoke: (ui: ExtensionUIContext) => Promise<PickerResult>,
  render?: PickerRender,
): Promise<PickerResult> {
  let finished = false;
  const custom = createFakeCustom({
    keybindings: KEYBINDINGS,
    keys,
    onDone: () => {
      finished = true;
    },
    onMount: () => {
      if (!finished) throw new Error("The picker did not finish.");
    },
    rendered: render?.lines,
    theme: THEME,
    width: render?.width,
  });
  const ui = { custom } as unknown as ExtensionUIContext;

  return invoke(ui);
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
});

describe("slice picker rendering", () => {
  it("renders two-line rows with a bold selection and metadata", async () => {
    const lines: string[] = [];

    await drivePicker(["escape"], (ui) => showStartPicker(ui, CANDIDATES), {
      lines,
      width: 40,
    });

    const selectedIndex = lines.findIndex((line) =>
      line.includes("<b>second</b>"),
    );

    expect(selectedIndex).toBeGreaterThanOrEqual(0);
    expect(lines[selectedIndex + 1]).toContain("Message 2 of 2");
    expect(lines.some((line) => line.includes("  first"))).toBe(true);
  });

  it("renders a scroll indicator at a fixed width", async () => {
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      id: `u${index + 1}`,
      ordinal: index + 1,
      text: `message ${index + 1}`,
      timestamp: new Date().toISOString(),
      total: 12,
    }));
    const lines: string[] = [];

    await drivePicker(["escape"], (ui) => showStartPicker(ui, candidates), {
      lines,
      width: 36,
    });

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
});
