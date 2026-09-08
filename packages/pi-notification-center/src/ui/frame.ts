/**
 * Border, padding, truncation, and side-by-side pane composition for the
 * toast cards and the history browser, all measured in visual columns.
 *
 * Widths come from `visibleWidth`, never `String.length`, because ANSI
 * escapes and wide characters would push a right border out of
 * alignment. A tab counts as three columns and is never expanded here,
 * matching Pi, which rewrites each tab to three spaces as it writes a
 * composited line out.
 *
 * Every border helper requires a width of at least two, the columns the
 * two end characters occupy. Each surface guarantees far more through its
 * own minimum before it draws, so a narrower width is a programmer error
 * and `frameSegment` throws on it. Judging a terminal too small belongs
 * to the surface, which omits itself.
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** One pane of a side-by-side layout. */
export interface FramePane {
  /** Already-styled content rows. Padded or truncated to the pane width. */
  lines: readonly string[];
  /** Header row drawn above the content, inside the pane. */
  title: string;
}

/**
 * Pane widths for one split frame, and the total width they belong to.
 *
 * Only {@link splitPaneWidths} produces this, so pane widths cannot be
 * paired with a total that disagrees with them.
 */
export interface SplitPanes {
  left: number;
  right: number;
  /** Total width of the frame, borders included. */
  width: number;
}

/**
 * Columns a single-pane frame's chrome occupies: two borders and one
 * space of padding on each side.
 */
export const FRAME_BODY_CHROME_COLUMNS = 4;

/**
 * Columns the split frame's chrome occupies: two outer borders, one space
 * of padding on each side of each pane, and the divider between them.
 */
export const SPLIT_FRAME_CHROME_COLUMNS = 7;

/**
 * Rows the split frame adds around its content: the top border, the pane
 * titles, the rule below them, the rule above the footer, the footer, and
 * the bottom border.
 */
export const SPLIT_FRAME_CHROME_ROWS = 6;

/**
 * Wrap `content` in left/right borders, padded to exactly `width` columns.
 *
 * Requires `width` of at least two.
 */
export function frameLine(content: string, width: number): string {
  return `│${padToWidth(content, width - 2)}│`;
}

/**
 * Render a `left + fill + right` border row, e.g. `┌────┐`.
 *
 * Requires `width` of at least two.
 */
export function frameSegment(
  left: string,
  right: string,
  width: number,
): string {
  return `${left}${"─".repeat(width - 2)}${right}`;
}

/** Pad or truncate `text` so it occupies exactly `width` visual columns. */
export function padToWidth(text: string, width: number, fill = " "): string {
  // The library defaults to three dots, which cost two more columns than
  // the callers here budget for.
  const truncated = truncateToWidth(text, width, "…");
  const paddingWidth = Math.max(0, width - visibleWidth(truncated));

  return `${truncated}${fill.repeat(paddingWidth)}`;
}

/**
 * Compose two panes side by side inside one border.
 *
 * Every line is drawn to `panes.width`, and both panes to `rows` content
 * rows, so the divider stays straight whatever each side holds. Panes
 * carry pre-styled text, so this only measures and pads. The output is
 * always `rows` plus {@link SPLIT_FRAME_CHROME_ROWS} lines.
 */
export function renderSplitFrame(options: {
  footer: string;
  left: FramePane;
  panes: SplitPanes;
  right: FramePane;
  rows: number;
  title: string;
}): string[] {
  const { footer, left, panes, right, rows, title } = options;
  const innerWidth = panes.width - 2;
  const leftRule = "─".repeat(panes.left + 2);
  const rightRule = "─".repeat(panes.right + 2);
  const lines = [
    `┌${padToWidth(`─ ${title} `, innerWidth, "─")}┐`,
    `│ ${padToWidth(left.title, panes.left)} │ ${padToWidth(right.title, panes.right)} │`,
    `├${leftRule}┬${rightRule}┤`,
  ];

  for (let row = 0; row < rows; row += 1) {
    const leftLine = padToWidth(left.lines[row] ?? "", panes.left);
    const rightLine = padToWidth(right.lines[row] ?? "", panes.right);

    lines.push(`│ ${leftLine} │ ${rightLine} │`);
  }

  lines.push(
    `├${leftRule}┴${rightRule}┤`,
    frameLine(` ${footer}`, panes.width),
    frameSegment("└", "┘", panes.width),
  );

  return lines;
}

/**
 * Split `width` into two pane widths, or report that it cannot be done.
 *
 * Returns `undefined` when `width` cannot hold two panes of at least
 * `minPaneWidth`, which is the caller's signal to omit the frame. The
 * width is never raised to make it fit, since that draws a frame wider
 * than the space it was given.
 */
export function splitPaneWidths(
  width: number,
  minPaneWidth: number,
  leftFraction = 0.5,
): SplitPanes | undefined {
  const contentWidth = width - SPLIT_FRAME_CHROME_COLUMNS;

  if (contentWidth < minPaneWidth * 2) return undefined;

  // Clamped from both sides so an extreme fraction cannot starve either
  // pane below the minimum the caller asked for.
  const left = Math.min(
    Math.max(Math.floor(contentWidth * leftFraction), minPaneWidth),
    contentWidth - minPaneWidth,
  );

  return { left, right: contentWidth - left, width };
}
