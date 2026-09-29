/**
 * Two-pane notification history browser. The left pane lists
 * notifications newest first, and the right pane shows the selected entry
 * in full.
 *
 * Layout is a pure function of the entries, the browser's state, and the
 * viewport; the component holds state and routes keys but computes no
 * widths of its own. Movement keys come from Pi's injected
 * `KeybindingsManager`, so the browser follows the user's keybinding
 * configuration.
 */

import type { NotificationEntry } from "../types.js";
import {
  formatDetailTitle,
  formatHistoryDetail,
  formatHistoryRow,
  HISTORY_EMPTY_MESSAGE,
  type HistoryTheme,
} from "./history-format.js";
import {
  renderSplitFrame,
  splitFrameBodyRows,
  splitPaneWidths,
} from "./split-frame.js";
import type {
  Component,
  Focusable,
  KeybindingsManager,
  Terminal,
} from "@earendil-works/pi-tui";
import {
  emptyStateLines,
  frameBodyWidth,
  keyHint,
  layoutFramedSurface,
  listWindow,
  matchSelectAction,
  moveListSelection,
  overlayMaxHeight,
  scrollLines,
  wrapKeyHints,
} from "@sherif-fanous/pi-extensions-core";

/** One placed frame, with the state the caller carries forward. */
export interface HistoryLayout {
  /** Detail offset actually used, with pending pages applied and clamped. */
  detailOffset: number;
  /** List-pane rows, before framing. Empty for the empty state. */
  left: string[];
  /** The whole browser, framed and bounded to the requested width. */
  lines: string[];
  /** Detail-pane rows, before framing. Empty for the empty state. */
  right: string[];
  /** Content rows drawn, which is how tall one page of scrolling is. */
  rows: number;
}

/** Everything {@link layoutHistory} needs to place one frame. */
export interface HistoryLayoutOptions {
  /** Detail rows already scrolled past, before pending pages apply. */
  detailOffset: number;
  /** Newest first, matching display order. */
  items: readonly NotificationEntry[];
  /** Pi's keybindings, so the footer names the keys the user has bound. */
  keybindings: Pick<KeybindingsManager, "getKeys">;
  locale?: Intl.LocalesArgument;
  /**
   * Page-scroll requests not yet applied, positive for down.
   *
   * Counted in pages rather than rows because only the layout knows how
   * tall a page is, and a key can arrive before the first layout runs.
   */
  pendingPages: number;
  selected: number;
  /** Pi's terminal height, `tui.terminal.rows`. */
  terminalRows: number;
  theme: HistoryTheme;
  timeZone?: string;
  width: number;
}

/** Construction inputs for the history browser. */
export interface HistoryViewOptions {
  done: () => void;
  entries: readonly NotificationEntry[];
  keybindings: KeybindingsManager;
  locale?: Intl.LocalesArgument;
  /**
   * Pi's terminal, `tui.terminal`, whose height keeps the footer on
   * screen. Read on every render, so a resize needs no listener.
   */
  terminal: Pick<Terminal, "rows">;
  theme: HistoryTheme;
  timeZone?: string;
}

/**
 * Scrollable list of captured notifications with a detail pane.
 *
 * The layout is recomputed for the current viewport on every render, so a
 * terminal resize needs no listener.
 */
export class HistoryViewComponent implements Component, Focusable {
  focused = false;
  private closed = false;
  private detailOffset = 0;
  private pendingPages = 0;
  private selected = 0;
  /** Newest first, matching display order. */
  private readonly items: readonly NotificationEntry[];

  constructor(private readonly options: HistoryViewOptions) {
    this.items = [...options.entries].reverse();
  }

  handleInput(data: string): void {
    switch (matchSelectAction(this.options.keybindings, data)) {
      case "cancel":
        this.close();

        break;
      case "down":
        this.select("down");

        break;
      // Page keys scroll the detail pane, the one thing here that can
      // exceed the viewport and has no other way to move. Recorded in
      // pages so the distance is measured against the layout about to be
      // drawn, not the last one.
      case "pageDown":
        this.pendingPages += 1;

        break;
      case "pageUp":
        this.pendingPages -= 1;

        break;
      case "up":
        this.select("up");

        break;
      case "confirm":
      case undefined:
        break;
    }
  }

  invalidate(): void {
    // Every render re-derives its content, so there is nothing to drop.
  }

  render(width: number): string[] {
    const layout = layoutHistory({
      detailOffset: this.detailOffset,
      items: this.items,
      keybindings: this.options.keybindings,
      locale: this.options.locale,
      pendingPages: this.pendingPages,
      selected: this.selected,
      terminalRows: this.options.terminal.rows,
      theme: this.options.theme,
      timeZone: this.options.timeZone,
      width,
    });

    // A page key pressed while the terminal is too narrow to draw
    // anything is discarded rather than banked.
    this.pendingPages = 0;

    if (!layout) return [];

    this.detailOffset = layout.detailOffset;

    return layout.lines;
  }

  private close(): void {
    if (this.closed) return;

    this.closed = true;
    this.options.done();
  }

  /** Move the selection and reset the detail pane to the top. */
  private select(move: "down" | "up"): void {
    // ↑/↓ move one item, so the page size never applies.
    const next = moveListSelection(this.selected, this.items.length, move, 1);

    if (next === this.selected) return;

    this.selected = next;
    this.detailOffset = 0;
    this.pendingPages = 0;
  }
}

/** Whether a terminal is wide enough to show the browser at all. */
export function canShowHistoryBrowser(terminalWidth: number): boolean {
  return splitPaneWidths(terminalWidth, MIN_PANE_WIDTH) !== undefined;
}

/**
 * Place the whole browser for one viewport.
 *
 * Returns `undefined` when the terminal cannot hold two legible panes,
 * which is the caller's signal to omit the browser rather than draw a
 * frame that does not fit.
 */
export function layoutHistory(
  options: HistoryLayoutOptions,
): HistoryLayout | undefined {
  const { items, keybindings, pendingPages, selected, theme, width } = options;
  const panes = splitPaneWidths(width, MIN_PANE_WIDTH);

  if (!panes) return undefined;

  const footerWidth = frameBodyWidth(width);
  const closeHint = keyHint(keybindings, "tui.select.cancel", "Close");

  if (items.length === 0) {
    return {
      detailOffset: 0,
      left: [],
      lines: layoutFramedSurface({
        body: emptyStateLines(HISTORY_EMPTY_MESSAGE, footerWidth, theme),
        hints: [closeHint],
        scrollOffset: 0,
        terminalRows: options.terminalRows,
        theme,
        title: HISTORY_TITLE,
        width,
      }).lines,
      right: [],
      rows: 0,
    };
  }

  const height = overlayMaxHeight(options.terminalRows);
  const time = { locale: options.locale, timeZone: options.timeZone };
  const entry = items[selected];
  const detail = entry
    ? formatHistoryDetail(entry, theme, panes.right, time)
    : [];
  const moveHint = keyHint(
    keybindings,
    ["tui.select.up", "tui.select.down"],
    "Move",
  );
  // The page hint only appears once the detail overflows, and it can add
  // a footer line, so the rows are sized first without it. Adding it only
  // ever takes rows away, so the detail still overflows afterwards.
  let footer = wrapKeyHints([moveHint, closeHint], footerWidth);
  let rows = contentRows(
    splitFrameBodyRows(height, footer.length),
    Math.max(items.length, detail.length),
  );

  if (detail.length > rows) {
    const pageHint = keyHint(
      keybindings,
      ["tui.select.pageUp", "tui.select.pageDown"],
      "Scroll Detail",
    );

    footer = wrapKeyHints([moveHint, pageHint, closeHint], footerWidth);
    rows = contentRows(
      splitFrameBodyRows(height, footer.length),
      Math.max(items.length, detail.length),
    );
  }

  const scrolled = scrollLines(
    detail,
    rows,
    options.detailOffset + pendingPages * rows,
    panes.right,
    theme,
  );
  const list = listWindow(selected, items.length, rows);
  const left = items.slice(list.start, list.end).map((item, index) =>
    formatHistoryRow(item, theme, panes.left, {
      ...time,
      selected: list.start + index === selected,
    }),
  );
  const lines = renderSplitFrame({
    footer,
    left: {
      lines: left,
      title: "",
      ...(list.position === undefined
        ? {}
        : { titleRight: theme.fg("muted", list.position) }),
    },
    panes,
    right: {
      lines: scrolled.lines,
      title: theme.fg(
        "muted",
        formatDetailTitle(scrolled.offset, rows, detail.length),
      ),
    },
    rows,
    theme,
    title: HISTORY_TITLE,
  });

  return {
    detailOffset: scrolled.offset,
    left,
    lines,
    right: scrolled.lines,
    rows,
  };
}

/**
 * Decide how many content rows to draw.
 *
 * Enough for whichever pane is taller, so a long notification uses the
 * terminal rather than forcing a scroll, and never more than `available`,
 * the rows left once the frame's own rows keep the footer on screen.
 */
function contentRows(available: number, neededRows: number): number {
  return Math.max(
    1,
    Math.min(available, Math.max(neededRows, MIN_CONTENT_ROWS)),
  );
}

/** Title of the browser's frame. */
const HISTORY_TITLE = "Notifications";

/** Fewest content rows worth drawing. */
const MIN_CONTENT_ROWS = 6;

/** Narrowest pane that still fits a time, a severity, and some text. */
const MIN_PANE_WIDTH = 16;
