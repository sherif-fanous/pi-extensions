import { createNotificationEntry } from "../src/history.js";
import type { NotificationEntry } from "../src/types.js";
import { HistoryViewComponent } from "../src/ui/history-view.js";
import {
  createFakeKeybindings,
  createMarkerTheme,
  createPlainTheme,
} from "./helpers.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";

const FIRST = 1_715_933_350_000;

describe("HistoryViewComponent", () => {
  it("frames every line to the requested width", () => {
    for (const width of [80, 120]) {
      for (const line of build(entries(3)).render(width)) {
        expect(visibleWidth(line)).toBe(width);
      }
    }
  });

  it("keeps its own minimum width on a narrow terminal", () => {
    const lines = build(entries(3)).render(20);
    const width = visibleWidth(lines[0] ?? "");

    expect(width).toBeGreaterThan(20);

    for (const line of lines) {
      expect(visibleWidth(line)).toBe(width);
    }
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
    const lines = build([
      createNotificationEntry("oldest", "info", FIRST),
      createNotificationEntry("newest", "error", FIRST + 1000),
    ]).render(100);
    const listPane = lines.map((line) => line.split("│")[1] ?? "").join(" ");
    const detailPane = lines.map((line) => line.split("│")[2] ?? "").join(" ");

    expect(listPane.indexOf("newest")).toBeLessThan(listPane.indexOf("oldest"));
    expect(detailPane).toContain("newest");
    expect(detailPane).not.toContain("oldest");
  });

  it("shows the selection count", () => {
    const view = build(entries(4));

    expect(view.render(100).join(" ")).toContain("1/4");

    view.handleInput("DOWN");

    expect(view.render(100).join(" ")).toContain("2/4");
  });

  it("moves the detail pane with the selection", () => {
    const view = build([
      createNotificationEntry("older entry", "info", FIRST),
      createNotificationEntry("newer entry", "warning", FIRST + 1000),
    ]);
    const detail = (): string =>
      view
        .render(100)
        .map((line) => line.split("│")[2] ?? "")
        .join(" ");

    expect(detail()).toContain("newer entry");

    view.handleInput("DOWN");

    expect(detail()).toContain("older entry");
    expect(detail()).not.toContain("newer entry");
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
    const detail = (): string =>
      view
        .render(100)
        .map((line) => line.split("│")[2] ?? "")
        .join(" ");
    const top = detail();

    view.handleInput("PGDN");

    expect(detail()).not.toBe(top);

    view.handleInput("PGUP");

    expect(detail()).toBe(top);

    // Scroll away, move selection, and come back: the pane starts at the
    // top rather than keeping a stale offset.
    view.handleInput("PGDN");
    view.handleInput("DOWN");
    view.handleInput("UP");

    expect(detail()).toBe(top);
  });

  it("keeps a long message reachable rather than truncating it", () => {
    const view = build([
      createNotificationEntry(`${numberedLines(200)}\nterminus`, "info", FIRST),
    ]);

    for (let index = 0; index < 40; index += 1) view.handleInput("PGDN");

    expect(
      view
        .render(100)
        .map((line) => line.split("│")[2] ?? "")
        .join(" "),
    ).toContain("terminus");
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

function numberedLines(count: number): string {
  return Array.from(
    { length: count },
    (_value, index) => `detail line ${String(index)}`,
  ).join("\n");
}
