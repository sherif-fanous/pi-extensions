/**
 * Focused two-pane notification-history browser.
 *
 * Owns the selection index, detail scroll offset, keyboard handling, and
 * the footer hint. It does NOT own formatting (see `history-format.ts`),
 * frame geometry (see `frame.ts`), session access, or command
 * registration.
 *
 * Layout is a pure function of the entries, the browser's state, and the
 * viewport. The component holds state and routes keys; it computes no
 * widths of its own. Tests assert on the function.
 *
 * The left pane lists notifications newest first; the right pane shows the
 * selected entry in full. Movement keys come from Pi's injected
 * `KeybindingsManager` rather than hardcoded escape sequences, so the
 * browser follows the user's own keybinding configuration.
 *
 * A terminal too narrow for two legible panes gets no browser at all,
 * rather than a frame with its right border cut off. `/notifications`
 * answers with a plain notification instead, so a typed command is never
 * met with silence.
 */

import type { NotificationEntry } from "../types.js";
import {
  FRAME_BODY_CHROME_COLUMNS,
  frameLine,
  frameSegment,
  renderSplitFrame,
  SPLIT_FRAME_CHROME_ROWS,
  splitPaneWidths,
} from "./frame.js";
import {
  formatDetailTitle,
  formatHistoryDetail,
  formatHistoryRow,
  HISTORY_EMPTY_MESSAGE,
  markDetailScroll,
  type HistoryTheme,
} from "./history-format.js";
import {
  truncateToWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type KeybindingsManager,
} from "@earendil-works/pi-tui";

/** One placed frame, with the state the caller must carry forward. */
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
  locale?: Intl.LocalesArgument;
  /**
   * Page-scroll requests not yet applied, positive for down.
   *
   * Carried as pages rather than rows because only the layout knows how
   * tall a page is, and a key can arrive before the first layout ever
   * runs.
   */
  pendingPages: number;
  selected: number;
  terminalHeight: number;
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
   * Current terminal height, so the browser can keep its footer on
   * screen. Read on every render, so a resize needs no listener.
   */
  terminalHeight: () => number;
  theme: HistoryTheme;
  timeZone?: string;
}

/**
 * Scrollable list of captured notifications with a detail pane.
 *
 * The layout is recomputed for the current viewport on every render, so a
 * terminal resize is handled without any resize listener.
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
    const { keybindings } = this.options;

    if (keybindings.matches(data, "tui.select.cancel")) {
      this.close();

      return;
    }

    if (keybindings.matches(data, "tui.select.up")) {
      this.selectBy(-1);

      return;
    }

    if (keybindings.matches(data, "tui.select.down")) {
      this.selectBy(1);

      return;
    }

    // Page keys scroll the detail pane, because a long message is the only
    // thing here that can exceed the viewport. The request is recorded in
    // pages, not rows, so it is measured against the layout that will
    // actually be drawn rather than whichever one happened to run last.
    if (keybindings.matches(data, "tui.select.pageUp")) {
      this.pendingPages -= 1;

      return;
    }

    if (keybindings.matches(data, "tui.select.pageDown")) {
      this.pendingPages += 1;
    }
  }

  invalidate(): void {
    // Content is re-derived on every render; nothing is cached.
  }

  render(width: number): string[] {
    const layout = layoutHistory({
      detailOffset: this.detailOffset,
      items: this.items,
      locale: this.options.locale,
      pendingPages: this.pendingPages,
      selected: this.selected,
      terminalHeight: this.options.terminalHeight(),
      theme: this.options.theme,
      timeZone: this.options.timeZone,
      width,
    });

    // Consumed either way. A page key pressed while the terminal is too
    // narrow to draw anything is discarded rather than banked.
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
  private selectBy(delta: number): void {
    const next = clamp(this.selected + delta, 0, this.items.length - 1);

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
  const { items, pendingPages, selected, theme, width } = options;
  const panes = splitPaneWidths(width, MIN_PANE_WIDTH);

  if (!panes) return undefined;

  if (items.length === 0) {
    return {
      detailOffset: 0,
      left: [],
      lines: fitToWidth(renderEmpty(theme, width), width),
      right: [],
      rows: 0,
    };
  }

  const time = { locale: options.locale, timeZone: options.timeZone };
  const entry = items[selected];
  const detail = entry
    ? formatHistoryDetail(entry, theme, panes.right, time)
    : [];

  // Sized after the detail is formatted, because the taller pane decides
  // how many rows the browser needs.
  const rows = contentRows(
    options.terminalHeight,
    Math.max(items.length, detail.length),
  );
  const detailOffset = clamp(
    options.detailOffset + pendingPages * rows,
    0,
    Math.max(0, detail.length - rows),
  );
  const listStart = clamp(
    selected - Math.floor(rows / 2),
    0,
    Math.max(0, items.length - rows),
  );
  const left = items.slice(listStart, listStart + rows).map((item, index) =>
    formatHistoryRow(item, theme, panes.left, {
      ...time,
      selected: listStart + index === selected,
    }),
  );
  const right = markDetailScroll(
    detail.slice(detailOffset, detailOffset + rows),
    theme,
    panes.right,
    {
      above: detailOffset > 0,
      below: detailOffset + rows < detail.length,
    },
  );
  const lines = renderSplitFrame({
    footer: theme.fg("dim", footerHint(detail.length, rows)),
    left: {
      lines: left,
      title: theme.fg("dim", `${String(selected + 1)}/${String(items.length)}`),
    },
    panes,
    right: {
      lines: right,
      title: theme.fg(
        "dim",
        formatDetailTitle(detailOffset, rows, detail.length),
      ),
    },
    rows,
    title: theme.fg("accent", theme.bold("Notifications")),
  });

  return { detailOffset, left, lines: fitToWidth(lines, width), right, rows };
}

/**
 * Content rows to draw.
 *
 * Enough for whichever pane is taller, so a single long notification uses
 * the terminal instead of forcing a scroll, and always small enough that
 * the frame's own rows keep the footer on screen.
 */
function contentRows(terminalHeight: number, neededRows: number): number {
  const available =
    Math.floor((terminalHeight * HISTORY_MAX_HEIGHT_PERCENT) / 100) -
    SPLIT_FRAME_CHROME_ROWS -
    1;

  return Math.max(
    1,
    Math.min(available, Math.max(neededRows, MIN_CONTENT_ROWS)),
  );
}

/**
 * Bound every line to the width the browser was given.
 *
 * `renderSplitFrame` already draws to exactly that width, so this changes
 * nothing today. It is here so that a future change to the frame's chrome
 * cannot reach the terminal as a row that overruns its viewport, which is
 * the defect this browser used to have.
 */
function fitToWidth(lines: readonly string[], width: number): string[] {
  return lines.map((line) => truncateToWidth(line, width, ""));
}

function footerHint(detailLines: number, rows: number): string {
  return detailLines > rows
    ? "↑/↓ Select · PgUp/PgDn Scroll detail · Esc Close"
    : "↑/↓ Select · Esc Close";
}

function renderEmpty(theme: HistoryTheme, width: number): string[] {
  const bodyWidth = Math.max(1, width - FRAME_BODY_CHROME_COLUMNS);

  return [
    frameSegment("┌", "┐", width),
    frameLine(` ${theme.fg("accent", theme.bold("Notifications"))}`, width),
    frameSegment("├", "┤", width),
    ...wrapTextWithAnsi(HISTORY_EMPTY_MESSAGE, bodyWidth).map((line) =>
      frameLine(` ${line} `, width),
    ),
    frameSegment("├", "┤", width),
    frameLine(` ${theme.fg("dim", "Esc Close")}`, width),
    frameSegment("└", "┘", width),
  ];
}

/** Percentage of the terminal height the browser may occupy. */
export const HISTORY_MAX_HEIGHT_PERCENT = 80;

/** Fewest content rows worth drawing. */
const MIN_CONTENT_ROWS = 6;

/** Narrowest pane that still fits a time, a severity, and some text. */
const MIN_PANE_WIDTH = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
