import { createNotificationEntry } from "../src/history.js";
import type { NotificationEntry } from "../src/types.js";
import {
  canShowHistoryBrowser,
  HistoryViewComponent,
  layoutHistory,
  type HistoryLayout,
  type HistoryViewOptions,
} from "../src/ui/history-view.js";
import { visibleWidth, type KeybindingsManager } from "@earendil-works/pi-tui";
import { overlayMaxHeight } from "@sherif-fanous/pi-extensions-core";
import {
  createFakeKeybindings,
  createMarkerTheme,
  createPiKeybindings,
  createPlainTheme,
  findOverflowingLines,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
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

  // Pi slices a frame drawn wider than the viewport, leaving a border
  // that stops short. Drawing nothing is the documented answer, and
  // `/notifications` says so in words instead.
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

  // A pane recovered by splitting a rendered line on the divider
  // character would shift every field one pane to the right here.
  it("reads a message that contains the divider character", () => {
    const layout = layout2([
      createNotificationEntry("a │ b │ c", "info", FIRST),
    ]);

    expect(layout.right.join(" ")).toContain("a │ b │ c");
  });

  it("shows a muted list position once the list scrolls", () => {
    const view = build(entries(30), { terminalHeight: () => 14 });

    expect(view.render(100)[TITLE_ROW]).toMatch(/\(1\/30\) │ Detail/u);

    view.handleInput("DOWN");

    expect(view.render(100)[TITLE_ROW]).toMatch(/\(2\/30\) │ Detail/u);

    const marked = build(entries(30), {
      terminalHeight: () => 14,
      theme: createMarkerTheme(),
    });

    expect(marked.render(100)[TITLE_ROW]).toContain("<muted>(1/30)</muted>");
    expect(marked.render(100)[TITLE_ROW]).toContain("<muted>Detail</muted>");
  });

  it("shows no list position while every entry fits", () => {
    expect(build(entries(4)).render(100)[TITLE_ROW]).not.toMatch(/\d\/\d/u);
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
    const lines = build([createNotificationEntry("bad news", "error", FIRST)], {
      theme: createMarkerTheme(),
    }).render(100);
    const text = lines.join(" ");

    expect(text).toContain("<error>");
    expect(text).toContain("ERROR");
  });

  it("highlights exactly one row, and it is the selected one", () => {
    // The marker theme is not zero-width, so assert on the highlight's
    // presence and position, never on text that it may have truncated.
    const view = build(entries(3), { theme: createMarkerTheme() });
    const highlightedRow = (): number =>
      view.render(100).findIndex((line) => line.includes("<bg:selectedBg>"));
    const first = highlightedRow();

    expect(
      view.render(100).filter((line) => line.includes("<bg:selectedBg>")),
    ).toHaveLength(1);

    view.handleInput("DOWN");

    expect(highlightedRow()).toBe(first + 1);
  });

  it("wraps from the newest entry up to the oldest", () => {
    const view = build(entries(5), { theme: createMarkerTheme() });
    const highlightedRow = (): number =>
      view.render(100).findIndex((line) => line.includes("<bg:selectedBg>"));
    const newest = highlightedRow();

    view.handleInput("UP");

    expect(highlightedRow()).toBe(newest + 4);
  });

  it("details the oldest entry after wrapping up from the newest", () => {
    const view = build(entries(5));
    const detail = (): string =>
      view
        .render(100)
        .map((line) => line.split("│")[2] ?? "")
        .join(" ");

    expect(detail()).toContain("notification number 4");

    view.handleInput("UP");

    expect(detail()).toContain("notification number 0");
    expect(detail()).not.toContain("notification number 4");
  });

  it("wraps from the oldest entry down to the newest", () => {
    const view = build(entries(3));
    const top = view.render(100);

    for (let index = 0; index < 3; index += 1) view.handleInput("DOWN");

    expect(view.render(100)).toEqual(top);

    view.handleInput("DOWN");

    expect(view.render(100)).not.toEqual(top);
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

    // Scrolling away, moving the selection, and coming back starts the
    // pane at the top rather than at a stale offset.
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

  // Pi keeps only the top rows of an overlay taller than it asked for, so
  // the browser must fit the height Pi grants or lose its footer.
  it("fits its whole frame inside the height Pi grants a short terminal", () => {
    const long = createNotificationEntry(numberedLines(60), "info", FIRST);

    for (const width of [39, 40, 100]) {
      for (const list of [entries(30), [long], []]) {
        const lines = build(list, { terminalHeight: () => 14 }).render(width);

        expect(lines.length).toBeLessThanOrEqual(overlayMaxHeight(14));
        // The footer must survive, since it carries the only close hint.
        expect(lines.at(-2)).toContain("Esc Close");
      }
    }
  });

  it("fits every line at narrow widths", () => {
    const long = createNotificationEntry(
      `${numberedLines(60)}\n${"wide 日本語 ".repeat(20)}`,
      "warning",
      FIRST,
    );

    for (const width of [39, 40]) {
      for (const list of [entries(30), [long], []]) {
        const lines = build(list, { terminalHeight: () => 20 }).render(width);

        expect(lines.length).toBeGreaterThan(0);
        expect(findOverflowingLines(lines, width)).toEqual([]);
      }
    }
  });

  it("lists the keys that work in the footer", () => {
    const short = layout2([createNotificationEntry("short", "info", FIRST)]);
    const long = layout2(
      [createNotificationEntry(numberedLines(60), "info", FIRST)],
      { terminalHeight: 20 },
    );

    expect(short.lines.at(-2)).toBe(`│ ${"↑/↓ Move · Esc Close".padEnd(96)} │`);
    expect(long.lines.at(-2)).toBe(
      `│ ${"↑/↓ Move · PgUp/PgDn Scroll Detail · Esc Close".padEnd(96)} │`,
    );
  });

  // A footer cut at the right edge loses its last hint, which is the one
  // that says how to close the browser.
  it("wraps the footer between hints rather than cutting it", () => {
    const layout = layout2(
      [createNotificationEntry(numberedLines(60), "info", FIRST)],
      { terminalHeight: 20, width: 40 },
    );
    const footer = layout.lines
      .slice(-3, -1)
      .map((line) => line.slice(2, -2).trimEnd());

    expect(footer).toEqual(["↑/↓ Move · PgUp/PgDn Scroll Detail", "Esc Close"]);
    expect(footer.join(" ")).not.toContain("…");
  });

  it("colors the frame by meaning", () => {
    const lines = build(entries(2), { theme: createMarkerTheme() }).render(100);

    expect(lines[0]).toContain("<accent><b>Notifications</b></accent>");
    expect(lines[0]?.startsWith("<border>┌")).toBe(true);
    expect(lines.at(-2)).toContain("<dim>↑/↓ Move · Esc Close</dim>");
  });

  it("names and obeys the keys the user has bound instead of the defaults", () => {
    const done = vi.fn();
    const keybindings: KeybindingsManager = createPiKeybindings({
      "tui.select.cancel": "q",
      "tui.select.down": "j",
      "tui.select.pageDown": "ctrl+f",
      "tui.select.pageUp": "ctrl+b",
      "tui.select.up": "k",
    });
    const long = createNotificationEntry(numberedLines(60), "info", FIRST);
    const view = build(
      [createNotificationEntry("older", "info", FIRST), long],
      {
        done,
        keybindings,
        terminalHeight: () => 20,
      },
    );
    const top = view.render(100);

    expect(stripAnsi(top.at(-2) ?? "")).toContain(
      "k/j Move · Ctrl+B/Ctrl+F Scroll Detail · q Close",
    );

    // The default keys no longer do anything.
    for (const key of ["\u001B[B", "\u001B[A", "\u001B[6~", "\u001B"]) {
      view.handleInput(key);
    }

    expect(view.render(100)).toEqual(top);
    expect(done).not.toHaveBeenCalled();

    view.handleInput("\u0006");

    expect(view.render(100)).not.toEqual(top);

    view.handleInput("j");

    expect(view.render(100).join(" ")).toContain("older");
    expect(view.render(100)[TITLE_ROW]).toMatch(/│ Detail +│$/u);

    view.handleInput("q");

    expect(done).toHaveBeenCalledTimes(1);
  });

  it("frames the empty state with the title in the top border", () => {
    const lines = build([]).render(50);

    expect(lines).toEqual([
      `┌─ Notifications ${"─".repeat(32)}┐`,
      `│ ${"No notifications have been captured in this".padEnd(46)} │`,
      `│ ${"session yet.".padEnd(46)} │`,
      `├${"─".repeat(48)}┤`,
      `│ ${"Esc Close".padEnd(46)} │`,
      `└${"─".repeat(48)}┘`,
    ]);
  });

  it("mutes the empty-state message", () => {
    const lines = build([], { theme: createMarkerTheme() }).render(100);

    expect(lines.join(" ")).toContain(
      "<muted>No notifications have been captured in this session yet.</muted>",
    );
  });

  it("closes exactly once on the configured cancel input", () => {
    const done = vi.fn();
    const view = build(entries(2), { done });

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
  overrides: Partial<HistoryViewOptions> = {},
): HistoryViewComponent {
  return new HistoryViewComponent({
    done: () => undefined,
    entries: list,
    keybindings: createFakeKeybindings(),
    locale: "en-US",
    // Tall enough that the row budget never binds, so a test that is not
    // about height asserts on content alone.
    terminalHeight: () => 40,
    theme: createPlainTheme(),
    timeZone: "UTC",
    ...overrides,
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
    keybindings: createFakeKeybindings(),
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
