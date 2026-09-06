import { createNotificationEntry } from "../src/history.js";
import type { NotificationEntry } from "../src/types.js";
import {
  canShowHistoryBrowser,
  HistoryViewComponent,
  layoutHistory,
  type HistoryLayout,
} from "../src/ui/history-view.js";
import {
  createFakeKeybindings,
  createMarkerTheme,
  createPlainTheme,
} from "./helpers.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";

const FIRST = 1_715_933_350_000;

/** The frame row carrying both pane titles. */
const TITLE_ROW = 1;

describe("HistoryViewComponent", () => {
  it("frames every line to the requested width", () => {
    for (const width of [80, 120]) {
      for (const line of build(entries(3)).render(width)) {
        expect(visibleWidth(line)).toBe(width);
      }
    }
  });

  // Drawing a frame wider than the viewport is what Pi then slices, so
  // the user sees a border that stops short. Nothing at all is the
  // documented answer, and `/notifications` says so in words instead.
  it("draws nothing rather than overflow a narrow terminal", () => {
    expect(build(entries(3)).render(20)).toEqual([]);
    expect(build([]).render(20)).toEqual([]);
  });

  it("draws again once the terminal is widened", () => {
    const view = build(entries(3));

    expect(view.render(20)).toEqual([]);
    expect(view.render(100)).not.toEqual([]);
    expect(view.render(20)).toEqual([]);
  });

  it("draws two panes divided by a vertical rule", () => {
    const lines = build(entries(3)).render(100);
    const row = lines[3] ?? "";

    expect(row.startsWith("│")).toBe(true);
    expect(row.endsWith("│")).toBe(true);
    // Left border, divider, right border.
    expect([...row].filter((char) => char === "│")).toHaveLength(3);
  });

  it("lists newest first and details the newest by default", () => {
    const layout = layout2([
      createNotificationEntry("oldest", "info", FIRST),
      createNotificationEntry("newest", "error", FIRST + 1000),
    ]);
    const list = layout.left.join(" ");

    expect(list.indexOf("newest")).toBeLessThan(list.indexOf("oldest"));
    expect(layout.right.join(" ")).toContain("newest");
    expect(layout.right.join(" ")).not.toContain("oldest");
  });

  // The old assertions recovered a pane by splitting each rendered line
  // on the divider character, so a message containing that character
  // shifted every field one pane to the right.
  it("reads a message that contains the divider character", () => {
    const layout = layout2([
      createNotificationEntry("a │ b │ c", "info", FIRST),
    ]);

    expect(layout.right.join(" ")).toContain("a │ b │ c");
  });

  it("shows the selection count", () => {
    const view = build(entries(4));

    expect(view.render(100).join(" ")).toContain("1/4");

    view.handleInput("DOWN");

    expect(view.render(100).join(" ")).toContain("2/4");
  });

  it("moves the detail pane with the selection", () => {
    const list = [
      createNotificationEntry("older entry", "info", FIRST),
      createNotificationEntry("newer entry", "warning", FIRST + 1000),
    ];

    expect(layout2(list).right.join(" ")).toContain("newer entry");

    const moved = layout2(list, { selected: 1 });

    expect(moved.right.join(" ")).toContain("older entry");
    expect(moved.right.join(" ")).not.toContain("newer entry");
  });

  it("colorizes severities in both panes", () => {
    const lines = build(
      [createNotificationEntry("bad news", "error", FIRST)],
      () => undefined,
      createMarkerTheme(),
    ).render(100);
    const text = lines.join(" ");

    expect(text).toContain("<error>");
    expect(text).toContain("ERROR");
  });

  it("highlights exactly one row, and it is the selected one", () => {
    // The marker theme is not zero-width, so assert on the highlight's
    // presence and position, never on text that it may have truncated.
    const view = build(entries(3), () => undefined, createMarkerTheme());
    const highlightedRow = (): number =>
      view.render(100).findIndex((line) => line.includes("<bg:selectedBg>"));
    const first = highlightedRow();

    expect(
      view.render(100).filter((line) => line.includes("<bg:selectedBg>")),
    ).toHaveLength(1);

    view.handleInput("DOWN");

    expect(highlightedRow()).toBe(first + 1);
  });

  it("does not move the selection above the newest entry", () => {
    const view = build(entries(5));
    const top = view.render(100);

    view.handleInput("UP");

    expect(view.render(100)).toEqual(top);
  });

  it("does not move the selection past the oldest entry", () => {
    const view = build(entries(3));

    for (let index = 0; index < 20; index += 1) view.handleInput("DOWN");

    const end = view.render(100);

    view.handleInput("DOWN");

    expect(view.render(100)).toEqual(end);
    expect(end.join(" ")).toContain("3/3");
  });

  it("scrolls a long detail with page keys and resets on reselect", () => {
    // Every line must be distinguishable, or a scrolled pane would look
    // identical to an unscrolled one.
    const long = numberedLines(200);
    // Branch order is oldest-first, so the long entry goes last to be the
    // newest and therefore the initially selected one.
    const view = build([
      createNotificationEntry("second entry", "info", FIRST),
      createNotificationEntry(long, "info", FIRST + 1000),
    ]);
    const top = view.render(100);

    view.handleInput("PGDN");

    expect(view.render(100)).not.toEqual(top);

    view.handleInput("PGUP");

    expect(view.render(100)).toEqual(top);

    // Scroll away, move selection, and come back: the pane starts at the
    // top rather than keeping a stale offset.
    view.handleInput("PGDN");
    view.handleInput("DOWN");
    view.handleInput("UP");

    expect(view.render(100)).toEqual(top);
  });

  // The page height is a property of the layout about to be drawn, not of
  // whichever one happened to run last, so a page key that arrives before
  // the first render still moves by a full page.
  it("pages by the real page height before the first render", () => {
    const entry = createNotificationEntry(numberedLines(200), "info", FIRST);
    const early = build([entry]);
    const late = build([entry]);

    early.handleInput("PGDN");
    late.render(100);
    late.handleInput("PGDN");

    expect(early.render(100)).toEqual(late.render(100));
    // Both moved, so the two are not merely agreeing on doing nothing.
    expect(early.render(100)).not.toEqual(build([entry]).render(100));
  });

  it("moves one whole page, not a fixed number of rows", () => {
    const list = [createNotificationEntry(numberedLines(200), "info", FIRST)];

    expect(layout2(list, { pendingPages: 1 }).detailOffset).toBe(
      layout2(list).rows,
    );
  });

  it("keeps a long message reachable rather than truncating it", () => {
    const view = build([
      createNotificationEntry(`${numberedLines(200)}\nterminus`, "info", FIRST),
    ]);

    for (let index = 0; index < 40; index += 1) view.handleInput("PGDN");

    expect(view.render(100).join(" ")).toContain("terminus");
  });

  it("grows for a single long notification instead of forcing a scroll", () => {
    const layout = layout2(
      [createNotificationEntry(numberedLines(12), "warning", FIRST)],
      { terminalHeight: 40 },
    );

    expect(layout.right.join(" ")).toContain("detail line 11");
    // The whole message is on screen, so the footer drops the scroll hint.
    expect(layout.lines.at(-2)).not.toContain("PgDn");
  });

  it("advertises hidden detail in the pane title and last row", () => {
    const list = [createNotificationEntry(numberedLines(60), "info", FIRST)];
    const at = (pendingPages: number): HistoryLayout =>
      layout2(list, { pendingPages, terminalHeight: 20 });
    const top = at(0);

    // Title carries the range, last visible row carries the marker.
    expect(top.lines[TITLE_ROW]).toContain("/63");
    expect(top.right.at(-1)?.trimEnd().endsWith("↓")).toBe(true);

    // Mid-message both directions are marked, so the way back up is as
    // visible as the way down.
    const middle = at(1);

    expect(middle.right[0]?.trimEnd().endsWith("↑")).toBe(true);
    expect(middle.right.at(-1)?.trimEnd().endsWith("↓")).toBe(true);

    // At the bottom the range ends at the total, and only the up marker
    // remains.
    const bottom = at(20);

    expect(bottom.lines[TITLE_ROW]).toContain("63/63");
    expect(bottom.right[0]?.trimEnd().endsWith("↑")).toBe(true);
    expect(bottom.right.at(-1)?.trimEnd().endsWith("↓")).toBe(false);
  });

  it("leaves a message that fits without scroll indicators", () => {
    const layout = layout2([createNotificationEntry("short", "info", FIRST)]);

    expect(layout.lines[TITLE_ROW]).toContain("Detail");
    expect(layout.right.join(" ")).not.toMatch(/[↑↓↕]/u);
  });

  it("fits its whole frame inside a short terminal", () => {
    const view = new HistoryViewComponent({
      done: () => undefined,
      entries: entries(30),
      keybindings: createFakeKeybindings(),
      locale: "en-US",
      terminalHeight: () => 14,
      theme: createPlainTheme(),
      timeZone: "UTC",
    });
    const lines = view.render(100);

    expect(lines.length).toBeLessThanOrEqual(14);
    // The footer must survive, since it carries the only close hint.
    expect(lines.at(-2)).toContain("Esc Close");
  });

  it("shows an empty state with no panes", () => {
    const lines = build([]).render(100);

    expect(lines.join(" ")).toContain("No notifications have been captured");

    for (const line of lines) {
      expect(visibleWidth(line)).toBe(100);
      expect([...line].filter((char) => char === "│").length).toBeLessThan(3);
    }
  });

  it("closes exactly once on the configured cancel input", () => {
    const done = vi.fn();
    const view = build(entries(2), done);

    view.handleInput("DOWN");

    expect(done).not.toHaveBeenCalled();

    view.handleInput("\u001B");
    view.handleInput("\u001B");

    expect(done).toHaveBeenCalledTimes(1);
  });

  it("tracks focus for the hardware cursor", () => {
    const view = build(entries(1));

    expect(view.focused).toBe(false);

    view.focused = true;

    expect(view.focused).toBe(true);

    view.invalidate();
  });
});

describe("canShowHistoryBrowser", () => {
  // Two panes of sixteen columns, plus the frame's seven columns of
  // chrome. Stated as a literal so a change to either has to be meant.
  const MINIMUM = 39;

  it("refuses one column below the minimum", () => {
    expect(canShowHistoryBrowser(MINIMUM - 1)).toBe(false);
  });

  it("accepts exactly the minimum", () => {
    expect(canShowHistoryBrowser(MINIMUM)).toBe(true);
  });

  it("accepts one column above the minimum", () => {
    expect(canShowHistoryBrowser(MINIMUM + 1)).toBe(true);
  });

  it("agrees with what the browser actually draws", () => {
    for (const width of [MINIMUM - 1, MINIMUM, MINIMUM + 1, 100]) {
      const drawn = build(entries(3)).render(width).length > 0;

      expect(canShowHistoryBrowser(width)).toBe(drawn);
    }
  });
});

function build(
  list: NotificationEntry[],
  done: () => void = () => undefined,
  theme = createPlainTheme(),
): HistoryViewComponent {
  return new HistoryViewComponent({
    done,
    entries: list,
    keybindings: createFakeKeybindings(),
    locale: "en-US",
    // Tall enough that the row budget never binds, so a test that is not
    // about height asserts on content alone.
    terminalHeight: () => 40,
    theme,
    timeZone: "UTC",
  });
}

function entries(count: number): NotificationEntry[] {
  return Array.from({ length: count }, (_value, index) =>
    createNotificationEntry(
      `notification number ${String(index)}`,
      "info",
      FIRST + index * 1000,
    ),
  );
}

/** Lay out directly, so a case asserts on panes rather than on borders. */
function layout2(
  list: NotificationEntry[],
  overrides: Partial<Parameters<typeof layoutHistory>[0]> = {},
): HistoryLayout {
  const layout = layoutHistory({
    detailOffset: 0,
    items: [...list].reverse(),
    locale: "en-US",
    pendingPages: 0,
    selected: 0,
    terminalHeight: 40,
    theme: createPlainTheme(),
    timeZone: "UTC",
    width: 100,
    ...overrides,
  });

  if (!layout) throw new Error("expected a layout at this width");

  return layout;
}

function numberedLines(count: number): string {
  return Array.from(
    { length: count },
    (_value, index) => `detail line ${String(index)}`,
  ).join("\n");
}
