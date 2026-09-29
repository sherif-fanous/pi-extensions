/**
 * Lays out the family's framed, scrollable surface: a frame sized to the
 * overlay height whose body scrolls when it is taller than the rows left
 * once the footer, or the busy line in its place, is drawn.
 */

import {
  frameBodyRows,
  frameBodyWidth,
  renderFrame,
  type FrameTheme,
} from "./frame.js";
import { wrapKeyHints } from "./key-hints.js";
import { scrollLines } from "./list.js";
import { overlayMaxHeight } from "./overlay.js";

/** A surface laid out by {@link layoutFramedSurface}. */
export interface FramedSurfaceLayout {
  /** Body rows shown, the distance one page of scrolling moves. */
  readonly bodyRows: number;
  /** The framed surface, each line exactly the requested width. */
  readonly lines: string[];
  /** The offset clamped into range; store it for the next render. */
  readonly scrollOffset: number;
}

/** Content of a surface drawn by {@link layoutFramedSurface}. */
export interface FramedSurfaceOptions {
  /**
   * Already-styled rows, fitted to `frameBodyWidth(width)`, that scroll
   * with `↑`/`↓` edge markers when they do not fit.
   */
  readonly body: readonly string[];
  /** Busy line drawn dim in place of the hints, such as `Saving…`. */
  readonly busy?: string;
  /** Footer hints while the body fits, in footer order. */
  readonly hints: readonly (string | undefined)[];
  /**
   * Footer hints while the body is taller than its rows, such as `hints`
   * with `↑/↓ Scroll` and `PgUp/PgDn Page` added. Defaults to `hints`.
   */
  readonly overflowHints?: readonly (string | undefined)[];
  /**
   * Already-styled rows drawn below the scrolled body and never scrolled,
   * such as a form's buttons. The body keeps at least one row.
   */
  readonly pinned?: readonly string[];
  /**
   * Body lines from `start` up to the exclusive `end` to keep in view,
   * such as a form's focused field; the offset moves as little as it can.
   */
  readonly reveal?: { readonly end: number; readonly start: number };
  /** Body lines scrolled past, as returned by the last layout. */
  readonly scrollOffset: number;
  /** Pi's terminal height, `tui.terminal.rows`. */
  readonly terminalRows: number;
  readonly theme: FrameTheme;
  /** Plain Title Case title, drawn bold in the accent color. */
  readonly title: string;
  /** Already-styled text at the right end of the top border. */
  readonly titleRight?: string;
  /** Total width, borders included. */
  readonly width: number;
}

/**
 * Lay out a framed surface in the height Pi gives an overlay on a
 * terminal `terminalRows` tall.
 *
 * The footer is the busy line when there is one, else `hints` wrapped
 * between hints, or `overflowHints` when the body does not fit under
 * `hints`. The body gets the rows the footer and `pinned` leave, at least
 * one, and scrolls from `scrollOffset`.
 */
export function layoutFramedSurface(
  options: FramedSurfaceOptions,
): FramedSurfaceLayout {
  const { body, busy, hints, pinned = [], reveal, theme, width } = options;
  const bodyWidth = frameBodyWidth(width);
  const height = overlayMaxHeight(options.terminalRows);
  const footerFor = (
    shownHints: readonly (string | undefined)[],
  ): readonly string[] =>
    busy === undefined ? wrapKeyHints(shownHints, bodyWidth) : [busy];
  const rowsUnder = (footer: readonly string[]): number =>
    Math.max(1, frameBodyRows(height, footer.length) - pinned.length);
  const fitFooter = footerFor(hints);
  const footer =
    body.length > rowsUnder(fitFooter)
      ? footerFor(options.overflowHints ?? hints)
      : fitFooter;
  const bodyRows = rowsUnder(footer);
  const offset =
    reveal === undefined
      ? options.scrollOffset
      : offsetRevealing(options.scrollOffset, bodyRows, reveal);
  const scrolled = scrollLines(body, bodyRows, offset, bodyWidth, theme);

  return {
    bodyRows,
    lines: renderFrame({
      body: [...scrolled.lines, ...pinned],
      footer,
      theme,
      title: options.title,
      titleRight: options.titleRight,
      width,
    }),
    scrollOffset: scrolled.offset,
  };
}

/**
 * The offset closest to `offset` that shows `range` in a window of `rows`
 * lines. A range taller than the window shows its first line.
 */
function offsetRevealing(
  offset: number,
  rows: number,
  range: { readonly end: number; readonly start: number },
): number {
  if (range.start < offset || range.end - range.start > rows) {
    return range.start;
  }

  if (range.end > offset + rows) return range.end - rows;

  return offset;
}
