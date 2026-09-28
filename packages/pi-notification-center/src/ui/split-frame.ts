/**
 * Side-by-side pane composition for the history browser, built from the
 * family frame helpers so its borders, title, and footer match every
 * other framed surface.
 *
 * Widths come from `visibleWidth`, never `String.length`, because ANSI
 * escapes and wide characters would push a right border out of
 * alignment. Judging a terminal too narrow for two panes belongs to
 * {@link splitPaneWidths}, and the surface omits itself when it says no.
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import {
  frameBodyWidth,
  frameLine,
  frameSegment,
  frameTop,
  padToWidth,
  type FrameTheme,
} from "@sherif-fanous/pi-extensions-core";

/** One pane of a side-by-side layout. */
export interface FramePane {
  /** Already-styled content rows. Padded or truncated to the pane width. */
  lines: readonly string[];
  /** Already-styled header drawn above the content, inside the pane. */
  title: string;
  /**
   * Already-styled text at the right end of the header row, such as a
   * muted `(3/12)` position.
   */
  titleRight?: string;
}

/** Everything {@link renderSplitFrame} draws. */
export interface SplitFrameOptions {
  /** Plain footer lines, drawn dim below a rule, such as `wrapKeyHints` output. */
  footer: readonly string[];
  left: FramePane;
  panes: SplitPanes;
  right: FramePane;
  /** Content rows drawn in each pane. */
  rows: number;
  theme: FrameTheme;
  /** Plain Title Case title, drawn bold in the accent color. */
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
 * Columns the split frame's chrome occupies: two outer borders, one space
 * of padding on each side of each pane, and the divider between them.
 */
export const SPLIT_FRAME_CHROME_COLUMNS = 7;

/**
 * Rows the split frame adds around its content besides the footer: the
 * top border, the pane titles, the rule below them, the rule above the
 * footer, and the bottom border.
 */
const SPLIT_FRAME_CHROME_ROWS = 5;

/**
 * Compose two panes side by side inside one border.
 *
 * Every line is drawn to `panes.width`, and both panes to `rows` content
 * rows, so the divider stays straight whatever each side holds. Panes
 * carry pre-styled text, so this only measures and pads. The output is
 * `rows + footer.length + 5` lines; {@link splitFrameBodyRows} sizes
 * `rows` for a given height.
 */
export function renderSplitFrame(options: SplitFrameOptions): string[] {
  const { footer, left, panes, right, rows, theme, title } = options;
  const border = (text: string): string => theme.fg("border", text);
  const divider = border("│");
  const leftRule = "─".repeat(panes.left + 2);
  const rightRule = "─".repeat(panes.right + 2);
  const footerWidth = frameBodyWidth(panes.width);
  const row = (leftText: string, rightText: string): string =>
    `${divider} ${leftText} ${divider} ${rightText} ${divider}`;
  const lines = [
    frameTop(title, panes.width, theme),
    row(paneTitle(left, panes.left), paneTitle(right, panes.right)),
    border(`├${leftRule}┬${rightRule}┤`),
  ];

  for (let index = 0; index < rows; index += 1) {
    lines.push(
      row(
        padToWidth(left.lines[index] ?? "", panes.left),
        padToWidth(right.lines[index] ?? "", panes.right),
      ),
    );
  }

  lines.push(
    border(`├${leftRule}┴${rightRule}┤`),
    ...footer.map((line) =>
      frameLine(
        ` ${padToWidth(theme.fg("dim", line), footerWidth)} `,
        panes.width,
        theme,
      ),
    ),
    frameSegment("└", "┘", panes.width, theme),
  );

  return lines;
}

/**
 * How many content rows fit in a split frame `height` rows tall whose
 * footer has `footerLineCount` lines. Never negative.
 */
export function splitFrameBodyRows(
  height: number,
  footerLineCount: number,
): number {
  return Math.max(0, height - SPLIT_FRAME_CHROME_ROWS - footerLineCount);
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

/**
 * A pane's header fitted to `width`, with `titleRight` at the right edge
 * one space clear of the title. The title gives way first when both do
 * not fit.
 */
function paneTitle(pane: FramePane, width: number): string {
  if (pane.titleRight === undefined) return padToWidth(pane.title, width);

  const titleWidth = Math.max(0, width - visibleWidth(pane.titleRight) - 1);

  return padToWidth(
    `${padToWidth(pane.title, titleWidth)} ${pane.titleRight}`,
    width,
  );
}
