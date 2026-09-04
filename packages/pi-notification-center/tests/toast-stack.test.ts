import { createNotificationEntry } from "../src/history.js";
import {
  DEFAULT_CONFIG,
  type NotificationConfig,
  type ToastConfig,
} from "../src/types.js";
import {
  canRenderToasts,
  renderToastStack,
  TOAST_FRAME_ROWS,
  ToastStackComponent,
  toBodyLines,
} from "../src/ui/toast-stack.js";
import { createPlainTheme } from "./helpers.js";
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
    expect(canRenderToasts(22, 4)).toBe(true);
    expect(canRenderToasts(21, 40)).toBe(false);
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
    for (const line of lines) expect(visibleWidth(line)).toBe(16 + 4);
    expect(visibleWidth(lines[0] ?? "")).toBeLessThan(
      DEFAULT_CONFIG.toast.width,
    );
  });

  it("sizes the whole stack to its widest message", () => {
    const lines = render([
      createNotificationEntry("tiny", "info", 1),
      createNotificationEntry("a message that is rather longer", "info", 2),
    ]);

    // 31 message columns plus the card's four columns of chrome.
    for (const line of lines) expect(visibleWidth(line)).toBe(35);
  });

  it("sizes a multiline message by its longest line", () => {
    const lines = render([
      createNotificationEntry("short\nthe longest line here\nmid", "info", 1),
    ]);

    for (const line of lines) expect(visibleWidth(line)).toBe(21 + 4);
  });

  it("never grows past the configured width", () => {
    const lines = render([createNotificationEntry("x".repeat(500), "info", 1)]);

    for (const line of lines) {
      expect(visibleWidth(line)).toBe(DEFAULT_CONFIG.toast.width);
    }
  });

  it("never falls below the minimum card width", () => {
    const lines = render([createNotificationEntry("hi", "info", 1)]);

    for (const line of lines) expect(visibleWidth(line)).toBe(20);
  });

  it("shrinks to a terminal narrower than the configured width", () => {
    const lines = renderToastStack(
      [createNotificationEntry("x".repeat(500), "info", 1)],
      THEME,
      DEFAULT_CONFIG,
      { terminalHeight: 40, terminalWidth: 40, viewportWidth: 40 },
    );

    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) expect(visibleWidth(line)).toBe(38);
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
        { terminalHeight: 40, terminalWidth: 21, viewportWidth: 21 },
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
