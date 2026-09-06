import { createNotificationEntry } from "../src/history.js";
import {
  DEFAULT_CONFIG,
  type NotificationConfig,
  type NotificationSeverity,
  type ToastConfig,
} from "../src/types.js";
import {
  canRenderToasts,
  renderToastStack,
  TOAST_FRAME_ROWS,
  ToastStackComponent,
  toBodyLines,
} from "../src/ui/toast-stack.js";
import { createMarkerTheme, createPlainTheme } from "./helpers.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

const THEME = createPlainTheme();

describe("toBodyLines", () => {
  it("keeps the message's own line breaks", () => {
    expect(toBodyLines("first\nsecond\nthird", 40, 5)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("preserves blank lines inside a message", () => {
    expect(toBodyLines("one\n\nthree", 40, 5)).toEqual(["one", "", "three"]);
  });

  it("treats a carriage return and newline pair as one break", () => {
    expect(toBodyLines("first\r\nsecond\r\nthird", 40, 5)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("carries styling across a line break", () => {
    const lines = toBodyLines("\u001b[31mred\nstill red\u001b[0m", 40, 5);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("\u001b[31m");
  });

  it("wraps a long paragraph instead of truncating it", () => {
    const lines = toBodyLines(`${"word ".repeat(12)}end`, 20, 5);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toContain("end");
  });

  it("marks the final row when the message exceeds the row limit", () => {
    const lines = toBodyLines("a\nb\nc\nd\ne\nf", 40, 3);

    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("c…");
  });

  it("always yields at least one row", () => {
    expect(toBodyLines("a\nb\nc", 40, 0)).toHaveLength(1);
  });
});

describe("canRenderToasts", () => {
  it("requires room for a minimal card", () => {
    expect(canRenderToasts(21, 4)).toBe(true);
    expect(canRenderToasts(20, 40)).toBe(false);
    expect(canRenderToasts(120, 3)).toBe(false);
  });

  it("still shows cards on a terminal narrower than the configured width", () => {
    expect(canRenderToasts(DEFAULT_CONFIG.toast.width - 10, 40)).toBe(true);
  });
});

describe("renderToastStack", () => {
  it("renders nothing for an empty stack", () => {
    expect(render([])).toEqual([]);
  });

  it("stacks cards downward in arrival order", () => {
    const lines = render([
      createNotificationEntry("first", "info", 1),
      createNotificationEntry("second", "warning", 2),
    ]);

    expect(lines).toHaveLength(2 * (TOAST_FRAME_ROWS + 1));
    expect(lines[0]).toContain("Info");
    expect(lines[1]).toContain("first");
    expect(lines[3]).toContain("Warning");
    expect(lines[4]).toContain("second");
  });

  it("labels every severity", () => {
    expect(render([createNotificationEntry("a", "info", 1)])[0]).toContain(
      "Info",
    );

    expect(render([createNotificationEntry("a", "warning", 1)])[0]).toContain(
      "Warning",
    );

    expect(render([createNotificationEntry("a", "error", 1)])[0]).toContain(
      "Error",
    );
  });

  // The plain theme every other test here uses discards the color it is
  // given, so only a marker theme can show which color a card asked for.
  // Both the border label and the body rows are checked because they are
  // separate calls that could lose the color independently. Markers are
  // not zero-width, so this asserts on styling alone and never on width.
  it("colors the label and the body of every severity", () => {
    for (const [severity, marker] of [
      ["info", "<accent>"],
      ["warning", "<warning>"],
      ["error", "<error>"],
    ] as const) {
      const [label, body] = renderMarked(severity);

      expect(label).toContain(marker);
      expect(body).toContain(marker);
    }
  });

  it("keeps every line exactly the configured width", () => {
    const lines = render([
      createNotificationEntry("short", "info", 1),
      createNotificationEntry("x".repeat(500), "error", 2),
      createNotificationEntry("multi\nline\nmessage", "warning", 3),
    ]);

    for (const line of lines) {
      expect(visibleWidth(line)).toBe(DEFAULT_CONFIG.toast.width);
    }
  });

  it("fits the card to a short message", () => {
    const lines = render([
      createNotificationEntry("Saved your work.", "info", 1),
    ]);

    // The message plus two borders and a space of padding on each side,
    // well inside the configured maximum.
    for (const line of lines) expect(cardWidth(line)).toBe(16 + 4);
    expect(cardWidth(lines[0] ?? "")).toBeLessThan(DEFAULT_CONFIG.toast.width);
  });

  it("holds a narrow card against the right edge of the surface", () => {
    const lines = render([
      createNotificationEntry("Saved your work.", "info", 1),
    ]);

    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      // The surface is anchored by the width it was created with, so a
      // line that stops short of that width leaves the card mid-screen.
      expect(visibleWidth(line)).toBe(DEFAULT_CONFIG.toast.width);
      expect(cardWidth(line)).toBe(16 + 4);
      expect(line.slice(0, DEFAULT_CONFIG.toast.width - (16 + 4))).toBe(
        " ".repeat(DEFAULT_CONFIG.toast.width - (16 + 4)),
      );
    }

    expect(lines[0]?.trimStart().startsWith("┌")).toBe(true);
    expect(lines.at(-1)?.trimStart().startsWith("└")).toBe(true);
  });

  it("sizes the whole stack to its widest message", () => {
    const lines = render([
      createNotificationEntry("tiny", "info", 1),
      createNotificationEntry("a message that is rather longer", "info", 2),
    ]);

    // 31 message columns plus the card's four columns of chrome.
    for (const line of lines) expect(cardWidth(line)).toBe(35);
  });

  it("sizes a multiline message by its longest line", () => {
    const lines = render([
      createNotificationEntry("short\nthe longest line here\nmid", "info", 1),
    ]);

    for (const line of lines) expect(cardWidth(line)).toBe(21 + 4);
  });

  it("never grows past the configured width", () => {
    const lines = render([createNotificationEntry("x".repeat(500), "info", 1)]);

    for (const line of lines) {
      expect(visibleWidth(line)).toBe(DEFAULT_CONFIG.toast.width);
    }
  });

  it("never falls below the minimum card width", () => {
    const lines = render([createNotificationEntry("hi", "info", 1)]);

    for (const line of lines) expect(cardWidth(line)).toBe(20);
  });

  // The surface is granted the terminal less its right margin, never the
  // whole terminal, so that is what the viewport carries here. A card
  // fills the region it was granted: reserving the margin a second time
  // is what used to leave a gap between the card and its own edge.
  it("shrinks to a terminal narrower than the configured width", () => {
    const lines = renderToastStack(
      [createNotificationEntry("x".repeat(500), "info", 1)],
      THEME,
      DEFAULT_CONFIG,
      { terminalHeight: 40, terminalWidth: 40, viewportWidth: 39 },
    );

    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      expect(cardWidth(line)).toBe(39);
      expect(visibleWidth(line)).toBe(39);
    }
  });

  it("gives a multiline message one row per line", () => {
    const lines = render([
      createNotificationEntry("alpha\nbeta\ngamma", "info", 1),
    ]);

    expect(lines).toHaveLength(TOAST_FRAME_ROWS + 3);
    expect(lines[1]).toContain("alpha");
    expect(lines[2]).toContain("beta");
    expect(lines[3]).toContain("gamma");
  });

  it("bounds a card at the configured maxLines", () => {
    const lines = render(
      [createNotificationEntry("a\nb\nc\nd\ne\nf\ng", "info", 1)],
      { toast: { maxLines: 3 } },
    );

    expect(lines).toHaveLength(TOAST_FRAME_ROWS + 3);
    expect(lines[3]).toContain("…");
  });

  it("wraps an over-wide message across rows", () => {
    const lines = render([createNotificationEntry("y ".repeat(80), "info", 1)]);

    expect(lines.length).toBeGreaterThan(TOAST_FRAME_ROWS + 1);

    for (const line of lines) {
      expect(visibleWidth(line)).toBe(DEFAULT_CONFIG.toast.width);
    }
  });

  it("omits the stack entirely on a terminal that is too narrow", () => {
    expect(
      renderToastStack(
        [createNotificationEntry("a", "info", 1)],
        THEME,
        DEFAULT_CONFIG,
        { terminalHeight: 40, terminalWidth: 20, viewportWidth: 19 },
      ),
    ).toEqual([]);
  });

  it("omits the stack entirely on a terminal that is too short", () => {
    expect(
      renderToastStack(
        [createNotificationEntry("a", "info", 1)],
        THEME,
        DEFAULT_CONFIG,
        { terminalHeight: 2, terminalWidth: 120, viewportWidth: 50 },
      ),
    ).toEqual([]);
  });

  it("keeps the newest cards when the stack exceeds its row budget", () => {
    const entries = Array.from({ length: 5 }, (_value, index) =>
      createNotificationEntry(`m${String(index)}`, "info", index),
    );
    // The budget is half the terminal height, so 14 rows allows two
    // three-row cards and not a third.
    const lines = renderToastStack(entries, THEME, DEFAULT_CONFIG, {
      terminalHeight: 14,
      terminalWidth: 120,
      viewportWidth: 50,
    });

    expect(lines).toHaveLength(2 * (TOAST_FRAME_ROWS + 1));
    expect(lines[1]).toContain("m3");
    expect(lines[4]).toContain("m4");
  });

  it("accounts for tall cards when fitting the stack", () => {
    const lines = renderToastStack(
      [
        createNotificationEntry("older", "info", 1),
        createNotificationEntry("a\nb\nc\nd", "info", 2),
      ],
      THEME,
      DEFAULT_CONFIG,
      { terminalHeight: 16, terminalWidth: 120, viewportWidth: 50 },
    );

    // The 6-row newest card fits the 8-row budget; adding the 3-row older
    // card would not.
    expect(lines).toHaveLength(TOAST_FRAME_ROWS + 4);
    expect(lines.join(" ")).not.toContain("older");
  });

  it("never lets the stack take more than half the terminal height", () => {
    const entries = Array.from({ length: 10 }, (_value, index) =>
      createNotificationEntry(`m${String(index)}`, "info", index),
    );
    const lines = render(entries, { maxToastsVisible: 10 });

    expect(lines.length).toBeLessThanOrEqual(50);
  });
});

describe("ToastStackComponent", () => {
  it("renders the list it was given at its reported terminal size", () => {
    const component = new ToastStackComponent(THEME, DEFAULT_CONFIG, () => ({
      height: 40,
      width: 120,
    }));

    expect(component.render(50)).toEqual([]);

    component.setToasts([createNotificationEntry("hello", "info", 1)]);
    component.invalidate();

    const lines = component.render(50);

    expect(lines).toHaveLength(TOAST_FRAME_ROWS + 1);
    expect(lines[1]).toContain("hello");
  });
});

/** Visible width of the card itself, ignoring the alignment gutter. */
function cardWidth(line: string): number {
  return visibleWidth(line.trimStart());
}

function render(
  entries: ReturnType<typeof createNotificationEntry>[],
  overrides: { maxToastsVisible?: number; toast?: Partial<ToastConfig> } = {},
): string[] {
  const config: NotificationConfig = {
    maxToastsVisible:
      overrides.maxToastsVisible ?? DEFAULT_CONFIG.maxToastsVisible,
    toast: { ...DEFAULT_CONFIG.toast, ...overrides.toast },
  };

  return renderToastStack(entries, THEME, config, {
    terminalHeight: 100,
    terminalWidth: 120,
    viewportWidth: config.toast.width,
  });
}

/** One card styled with visible color markers instead of ANSI codes. */
function renderMarked(severity: NotificationSeverity): string[] {
  return renderToastStack(
    [createNotificationEntry("a", severity, 1)],
    createMarkerTheme(),
    DEFAULT_CONFIG,
    {
      terminalHeight: 100,
      terminalWidth: 120,
      viewportWidth: DEFAULT_CONFIG.toast.width,
    },
  );
}
