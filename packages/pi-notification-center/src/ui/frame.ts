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
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** One pane of a side-by-side layout. */
export interface FramePane {
  /** Already-styled content rows. Padded or truncated to `width`. */
  lines: readonly string[];
  /** Header row drawn above the content, inside the pane. */
  title: string;
  width: number;
}

/**
 * Wrap `content` in left/right borders, padded to exactly `width` columns.
 */
export function frameLine(content: string, width: number): string {
  if (width <= 2) return truncateToWidth("││", width, "");

  return `│${padToWidth(content, width - 2)}│`;
}

/**
 * Render a `left + fill + right` border row, e.g. `┌────┐`.
 *
 * Falls back to a truncated `left`/`right` pair when the width is too
 * narrow for any fill characters.
 */
export function frameSegment(
  left: string,
  fill: string,
  right: string,
  width: number,
): string {
  if (width <= 2) return truncateToWidth(`${left}${right}`, width, "");

  return `${left}${fill.repeat(width - 2)}${right}`;
}

/** Pad or truncate `text` so it occupies exactly `width` visual columns. */
export function padToWidth(
  text: string,
  width: number,
  fill = " ",
  ellipsis = "…",
): string {
  const truncated = truncateToWidth(text, width, ellipsis);
  const paddingWidth = Math.max(0, width - visibleWidth(truncated));

  return `${truncated}${fill.repeat(paddingWidth)}`;
}

/**
 * Compose two panes side by side inside one border.
 *
 * Both panes are drawn to `rows` content rows so the divider stays
 * straight regardless of how much content each side holds. Panes carry
 * pre-styled text, so this helper only measures and pads.
 */
export function renderSplitFrame(options: {
  footer: string;
  left: FramePane;
  right: FramePane;
  rows: number;
  title: string;
}): string[] {
  const { footer, left, right, rows, title } = options;
  // Two panes, each with a space of padding on both sides, plus the
  // divider between them.
  const innerWidth = left.width + right.width + 5;
  const totalWidth = innerWidth + 2;
  const leftRule = "─".repeat(left.width + 2);
  const rightRule = "─".repeat(right.width + 2);
  const lines = [
    `┌${padToWidth(`─ ${title} `, innerWidth, "─")}┐`,
    `│ ${padToWidth(left.title, left.width)} │ ${padToWidth(right.title, right.width)} │`,
    `├${leftRule}┬${rightRule}┤`,
  ];

  for (let row = 0; row < rows; row += 1) {
    const leftLine = padToWidth(left.lines[row] ?? "", left.width);
    const rightLine = padToWidth(right.lines[row] ?? "", right.width);

    lines.push(`│ ${leftLine} │ ${rightLine} │`);
  }

  lines.push(
    `├${leftRule}┴${rightRule}┤`,
    frameLine(` ${footer}`, totalWidth),
    frameSegment("└", "─", "┘", totalWidth),
  );

  return lines;
}
