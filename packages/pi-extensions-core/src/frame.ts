/**
 * Draws the family's bordered frame: a top border carrying the accent
 * title, a padded body, a rule, a dim footer, and a bottom border.
 *
 * Every width is measured in visual columns with `visibleWidth`, never
 * `String.length`, so ANSI escapes and wide characters cannot push a
 * right border out of line. Every function returns lines exactly `width`
 * columns wide, and nothing at all for a width of zero or less, so a
 * narrow terminal shrinks the frame instead of overflowing it.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Content of a frame drawn by {@link renderFrame}. */
export interface FrameOptions {
  /** Already-styled body rows, each fitted to {@link frameBodyWidth}. */
  readonly body: readonly string[];
  /**
   * Plain footer lines, drawn dim below a rule: the lines
   * `wrapKeyHints` returns, or one busy line such as `Saving…`. An empty
   * footer draws no rule.
   */
  readonly footer: readonly string[];
  readonly theme: FrameTheme;
  /** Plain Title Case title, drawn bold in the accent color. */
  readonly title: string;
  /**
   * Already-styled text at the right end of the top border, such as a
   * muted `(3/12)` position. Dropped when the border cannot hold it.
   */
  readonly titleRight?: string;
  /** Total width, borders included. */
  readonly width: number;
}

/** The theme members the frame helpers style with. */
export type FrameTheme = Pick<Theme, "bold" | "fg">;

/**
 * Columns the frame's chrome takes from each row: two borders and one
 * space of padding on each side.
 */
const BODY_CHROME_COLUMNS = 4;
/** Rows the frame adds besides its body and footer: top, rule, bottom. */
const CHROME_ROWS_WITH_FOOTER = 3;
const HORIZONTAL = "─";

/**
 * How many body rows fit in a frame `height` rows tall whose footer has
 * `footerLineCount` lines. Never negative.
 */
export function frameBodyRows(height: number, footerLineCount: number): number {
  const chromeRows =
    footerLineCount > 0 ? CHROME_ROWS_WITH_FOOTER + footerLineCount : 2;

  return Math.max(0, height - chromeRows);
}

/** Columns a body or footer row has inside a frame `width` wide. */
export function frameBodyWidth(width: number): number {
  return Math.max(0, width - BODY_CHROME_COLUMNS);
}

/**
 * `content` between two borders, fitted to exactly `width` columns.
 *
 * The content is truncated with `…` or padded with spaces; it gets no
 * padding of its own, so custom layouts decide their own inset.
 */
export function frameLine(
  content: string,
  width: number,
  theme: Pick<Theme, "fg">,
): string {
  if (width <= 0) return "";

  const border = theme.fg("border", "│");

  if (width === 1) return border;

  return `${border}${padToWidth(content, width - 2)}${border}`;
}

/**
 * A horizontal border row `width` columns wide, such as `┌────┐` or
 * `├────┤`, drawn in the theme's border color.
 */
export function frameSegment(
  left: string,
  right: string,
  width: number,
  theme: Pick<Theme, "fg">,
): string {
  if (width <= 0) return "";
  if (width === 1) return theme.fg("border", left);

  return theme.fg("border", `${left}${HORIZONTAL.repeat(width - 2)}${right}`);
}

/**
 * The top border with the title in it: `┌─ Title ───── right ─┐`.
 *
 * The title is bold and accent-colored; `titleRight` keeps the caller's
 * styling. When the border is too narrow, `titleRight` is dropped first,
 * then the title is truncated with `…`, and a border with no room for
 * any title is drawn plain.
 */
export function frameTop(
  title: string,
  width: number,
  theme: FrameTheme,
  titleRight?: string,
): string {
  if (width <= 2) return frameSegment("┌", "┐", width, theme);

  const innerWidth = width - 2;
  // `─ ` before the title and ` ` after it.
  const titleChrome = 3;
  // ` ` before the right text and ` ─` after it.
  const rightWidth =
    titleRight === undefined ? 0 : visibleWidth(titleRight) + 3;
  const keepRight =
    titleRight !== undefined &&
    innerWidth - rightWidth - titleChrome >= visibleWidth(title);
  const titleBudget = innerWidth - titleChrome - (keepRight ? rightWidth : 0);

  if (titleBudget < 1) return frameSegment("┌", "┐", width, theme);

  const fittedTitle = truncateToWidth(title, titleBudget, "…");
  const fillWidth =
    innerWidth -
    titleChrome -
    visibleWidth(fittedTitle) -
    (keepRight ? rightWidth : 0);
  const border = (text: string): string => theme.fg("border", text);
  const right = keepRight ? ` ${titleRight} ${border(HORIZONTAL)}` : "";

  return [
    border(`┌${HORIZONTAL} `),
    theme.fg("accent", theme.bold(fittedTitle)),
    " ",
    border(HORIZONTAL.repeat(fillWidth)),
    right,
    border("┐"),
  ].join("");
}

/**
 * Fit `text` to exactly `width` columns: truncated with `ellipsis`, then
 * padded with `fill`. A width of zero or less returns an empty string.
 */
export function padToWidth(
  text: string,
  width: number,
  fill = " ",
  ellipsis = "…",
): string {
  const safeWidth = Math.max(0, width);
  const truncated = truncateToWidth(text, safeWidth, ellipsis);
  const paddingWidth = Math.max(0, safeWidth - visibleWidth(truncated));

  return `${truncated}${fill.repeat(paddingWidth)}`;
}

/**
 * Draw a whole frame: {@link frameTop}, the body rows padded by one
 * space on each side, a rule, the dim footer rows, and the bottom border.
 *
 * Returns `body.length + footer.length + 3` lines (`body.length + 2` with
 * no footer), each exactly `width` columns wide. Use
 * {@link frameBodyRows} to size the body for the height the overlay
 * asked for, and {@link frameBodyWidth} to fit its rows.
 */
export function renderFrame(options: FrameOptions): string[] {
  const { body, footer, theme, title, titleRight, width } = options;

  if (width <= 0) return [];

  const rowWidth = frameBodyWidth(width);
  const row = (content: string): string =>
    frameLine(` ${padToWidth(content, rowWidth)} `, width, theme);
  const footerRows =
    footer.length === 0
      ? []
      : [
          frameSegment("├", "┤", width, theme),
          ...footer.map((line) => row(theme.fg("dim", line))),
        ];

  return [
    frameTop(title, width, theme, titleRight),
    ...body.map((line) => row(line)),
    ...footerRows,
    frameSegment("└", "┘", width, theme),
  ];
}
