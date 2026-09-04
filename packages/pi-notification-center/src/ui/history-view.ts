/**
 * Focused two-pane notification-history browser.
 *
 * Owns the selection index, detail scroll offset, keyboard handling,
 * pane sizing, and the footer hint. It does NOT own formatting (see
 * `history-format.ts`), session access, or command registration.
 *
 * The left pane lists notifications newest first; the right pane shows the
 * selected entry in full. Movement keys come from Pi's injected
 * `KeybindingsManager` rather than hardcoded escape sequences, so the
 * browser follows the user's own keybinding configuration.
 */

import type { NotificationEntry } from "../types.js";
import { frameLine, frameSegment, renderSplitFrame } from "./frame.js";
import {
  formatDetailTitle,
  formatHistoryDetail,
  formatHistoryRow,
  HISTORY_EMPTY_MESSAGE,
  markDetailScroll,
  type HistoryTheme,
} from "./history-format.js";
import {
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type KeybindingsManager,
} from "@earendil-works/pi-tui";

/** Construction inputs for the history browser. */
export interface HistoryViewOptions {
  done: () => void;
  entries: readonly NotificationEntry[];
  keybindings: KeybindingsManager;
  locale?: Intl.LocalesArgument;
  /**
   * Current terminal height, so the browser can keep its footer on
   * screen. Defaults to a height that imposes no extra bound.
   */
  terminalHeight?: () => number;
  theme: HistoryTheme;
  timeZone?: string;
}

/**
 * Scrollable list of captured notifications with a detail pane.
 *
 * Both panes are recomputed for the current viewport on every render, so
 * a terminal resize is handled without any resize listener.
 */
export class HistoryViewComponent implements Component, Focusable {
  private closed = false;
  private detailOffset = 0;
  private rows = MIN_CONTENT_ROWS;
  private selected = 0;
  private _focused = false;
  /** Newest first, matching display order. */
  private readonly items: readonly NotificationEntry[];

  constructor(private readonly options: HistoryViewOptions) {
    this.items = [...options.entries].reverse();
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
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
    // thing here that can exceed the viewport.
    if (keybindings.matches(data, "tui.select.pageUp")) {
      this.scrollDetailBy(-this.rows);

      return;
    }

    if (keybindings.matches(data, "tui.select.pageDown")) {
      this.scrollDetailBy(this.rows);
    }
  }

  invalidate(): void {
    // Content is re-derived on every render; nothing is cached.
  }

  render(width: number): string[] {
    const frameWidth = Math.max(MIN_FRAME_WIDTH, width);

    if (this.items.length === 0) return this.renderEmpty(frameWidth);

    // Two panes, two single-space paddings each, the divider, and the
    // outer border.
    const contentWidth = frameWidth - 7;
    const leftWidth = Math.max(
      MIN_PANE_WIDTH,
      Math.floor(contentWidth * LEFT_PANE_FRACTION),
    );
    const rightWidth = Math.max(MIN_PANE_WIDTH, contentWidth - leftWidth);

    const entry = this.items[this.selected];
    const detail = entry
      ? formatHistoryDetail(entry, this.options.theme, rightWidth, {
          locale: this.options.locale,
          timeZone: this.options.timeZone,
        })
      : [];

    // Sized after the detail is formatted, because the taller pane decides
    // how many rows the browser needs.
    this.rows = this.contentRows(Math.max(this.items.length, detail.length));

    this.detailOffset = clamp(
      this.detailOffset,
      0,
      Math.max(0, detail.length - this.rows),
    );

    const visibleDetail = detail.slice(
      this.detailOffset,
      this.detailOffset + this.rows,
    );
    const detailEdges = {
      above: this.detailOffset > 0,
      below: this.detailOffset + this.rows < detail.length,
    };

    const listStart = clamp(
      this.selected - Math.floor(this.rows / 2),
      0,
      Math.max(0, this.items.length - this.rows),
    );

    return renderSplitFrame({
      footer: this.options.theme.fg("dim", this.footerHint(detail.length)),
      left: {
        lines: this.items
          .slice(listStart, listStart + this.rows)
          .map((item, index) =>
            formatHistoryRow(item, this.options.theme, leftWidth, {
              locale: this.options.locale,
              selected: listStart + index === this.selected,
              timeZone: this.options.timeZone,
            }),
          ),
        title: this.options.theme.fg(
          "dim",
          `${String(this.selected + 1)}/${String(this.items.length)}`,
        ),
        width: leftWidth,
      },
      right: {
        lines: markDetailScroll(
          visibleDetail,
          this.options.theme,
          rightWidth,
          detailEdges,
        ),
        title: this.options.theme.fg(
          "dim",
          formatDetailTitle(this.detailOffset, this.rows, detail.length),
        ),
        width: rightWidth,
      },
      rows: this.rows,
      title: this.options.theme.fg(
        "accent",
        this.options.theme.bold("Notifications"),
      ),
    });
  }

  /**
   * Content rows to draw.
   *
   * Enough for whichever pane is taller, so a single long notification
   * uses the terminal instead of forcing a scroll, and always small
   * enough that the frame's own rows keep the footer on screen. Without a
   * known terminal height there is nothing to fit to, so a fixed cap
   * stands in.
   */
  private contentRows(neededRows: number): number {
    const terminalHeight = this.options.terminalHeight?.();
    const available =
      terminalHeight === undefined
        ? FALLBACK_CONTENT_ROWS
        : Math.floor((terminalHeight * HISTORY_MAX_HEIGHT_PERCENT) / 100) -
          FRAME_ROWS -
          1;

    return Math.max(
      1,
      Math.min(available, Math.max(neededRows, MIN_CONTENT_ROWS)),
    );
  }

  private close(): void {
    if (this.closed) return;

    this.closed = true;
    this.options.done();
  }

  private footerHint(detailLines: number): string {
    return detailLines > this.rows
      ? "↑/↓ Select · PgUp/PgDn Scroll detail · Esc Close"
      : "↑/↓ Select · Esc Close";
  }

  private renderEmpty(width: number): string[] {
    const bodyWidth = Math.max(1, width - 4);

    return [
      frameSegment("┌", "─", "┐", width),
      frameLine(
        ` ${this.options.theme.fg("accent", this.options.theme.bold("Notifications"))}`,
        width,
      ),
      frameSegment("├", "─", "┤", width),
      ...wrapTextWithAnsi(HISTORY_EMPTY_MESSAGE, bodyWidth).map((line) =>
        frameLine(` ${line} `, width),
      ),
      frameSegment("├", "─", "┤", width),
      frameLine(` ${this.options.theme.fg("dim", "Esc Close")}`, width),
      frameSegment("└", "─", "┘", width),
    ];
  }

  /** Move the selection and reset the detail pane to the top. */
  private selectBy(delta: number): void {
    const next = clamp(this.selected + delta, 0, this.items.length - 1);

    if (next === this.selected) return;

    this.selected = next;
    this.detailOffset = 0;
  }

  private scrollDetailBy(delta: number): void {
    this.detailOffset = Math.max(0, this.detailOffset + delta);
  }
}

/** Rows the frame itself occupies: borders, titles, rules, and footer. */
const FRAME_ROWS = 6;

/** Percentage of the terminal height the browser may occupy. */
export const HISTORY_MAX_HEIGHT_PERCENT = 80;

/** Most content rows to draw when the terminal height is unknown. */
const FALLBACK_CONTENT_ROWS = 16;

/** Fewest content rows worth drawing. */
const MIN_CONTENT_ROWS = 6;

/** Share of the content width given to the list pane. */
const LEFT_PANE_FRACTION = 0.5;

/** Narrowest pane that still fits a time, a severity, and some text. */
const MIN_PANE_WIDTH = 16;

/** Narrowest frame that can hold two minimum-width panes. */
const MIN_FRAME_WIDTH = MIN_PANE_WIDTH * 2 + 7;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
