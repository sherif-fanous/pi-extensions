/**
 * Width-safe terminal framing primitives shared by custom surfaces.
 *
 * Owns border, padding, truncation, and side-by-side pane composition,
 * all operating on visual columns. It does NOT own any specific surface's
 * content, theme choices, or layout decisions.
 *
 * Every helper measures with `visibleWidth` instead of `String.length`
 * because ANSI escape sequences and wide characters would otherwise push
 * a right border out of alignment.
 *
 * A tab is measured as three columns, and nothing here expands one. Pi
 * rewrites every tab to three spaces as it writes each composited line
 * to the terminal, so the terminal never advances to its own tab stop
 * and a message containing a tab keeps its border aligned. Measuring a
 * tab as anything else, or expanding tabs here, would break that
 * agreement.
 *
 * Every border helper requires a width of at least two columns, which is
 * what the two end characters occupy on their own. Each surface already
 * guarantees far more through its own minimum before it decides to draw
 * at all, so a narrower width is a programmer error rather than a narrow
 * terminal, and `frameSegment` throws on one. Deciding that a terminal is
 * too small belongs to the surface, which omits itself; a helper that
 * quietly returned a shortened border would hand back chrome the caller
 * never asked for.
 *
 * The split frame takes the total width it may occupy and derives the
 * pane widths from it. The reverse, deriving the total from the panes,
 * forces every caller to reconstruct the chrome this module already
 * knows, and leaves the caller unable to promise it fits the space it
 * was given. `splitPaneWidths` answers "too narrow" with `undefined`
 * rather than by raising the width to a minimum, because raising it is
 * how a frame comes to be drawn wider than its viewport.
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
 * Only {@link splitPaneWidths} produces this, so a caller cannot pair
 * pane widths with a total that disagrees with them.
 */
export interface SplitPanes {
  left: number;
  right: number;
  /** Total width of the frame, borders included. */
  width: number;
}

/**
 * Columns a single-pane frame's chrome occupies.
 *
 * The two border columns and the single space of padding on each side.
 * Shared because a toast card and the browser's empty state are the same
 * shape, and a body width that disagrees with the border pushes the
 * right border out of line.
 */
export const FRAME_BODY_CHROME_COLUMNS = 4;

/**
 * Columns the split frame's own chrome occupies.
 *
 * Two outer borders, one space of padding on each side of each pane, and
 * the divider between them.
 */
export const SPLIT_FRAME_CHROME_COLUMNS = 7;

/**
 * Rows the split frame adds around its content.
 *
 * Top border, pane titles, the rule below them, the rule above the
 * footer, the footer, and the bottom border.
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
  // The single-character ellipsis is deliberate. The library defaults to
  // three dots, which would cost two more columns than the callers here
  // budget for.
  const truncated = truncateToWidth(text, width, "…");
  const paddingWidth = Math.max(0, width - visibleWidth(truncated));

  return `${truncated}${fill.repeat(paddingWidth)}`;
}

/**
 * Compose two panes side by side inside one border.
 *
 * Every line is drawn to `panes.width`, which is the width the caller was
 * given, so the result can never be wider than the space it belongs in.
 * Both panes are drawn to `rows` content rows so the divider stays
 * straight regardless of how much content each side holds. Panes carry
 * pre-styled text, so this helper only measures and pads.
 *
 * The output is always `rows` plus {@link SPLIT_FRAME_CHROME_ROWS} lines.
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
 * width is never raised to make it fit: a frame drawn wider than the
 * space it was given is the defect this guards against.
 */
export function splitPaneWidths(
  width: number,
  minPaneWidth: number,
  leftFraction = 0.5,
): SplitPanes | undefined {
  const contentWidth = width - SPLIT_FRAME_CHROME_COLUMNS;

  if (contentWidth < minPaneWidth * 2) return undefined;

  // Clamped from both sides, so an extreme fraction cannot starve either
  // pane below the minimum the caller asked for.
  const left = Math.min(
    Math.max(Math.floor(contentWidth * leftFraction), minPaneWidth),
    contentWidth - minPaneWidth,
  );

  return { left, right: contentWidth - left, width };
}
