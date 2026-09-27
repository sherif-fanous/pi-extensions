/**
 * Width-safe border, padding, and centering primitives shared by the
 * custom TUI dialogs.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

/**
 * A rendered dialog plus the body viewport it settled on, so the caller can
 * keep its scroll offset in range and size a page.
 */
export interface DialogFrame {
  readonly bodyRows: number;
  readonly lines: string[];
  readonly scrollOffset: number;
}

/**
 * Content of a bordered dialog. `bodyLines` scroll when the dialog is
 * taller than `maxHeight`; `pinnedLines` always stay visible below them.
 */
export interface DialogFrameOptions {
  readonly bodyLines: readonly string[];
  readonly footerHints: readonly string[];
  readonly maxHeight: number;
  readonly pinnedLines?: readonly string[];
  readonly scrollOffset: number;
  readonly theme: Pick<Theme, "fg">;
  readonly title: string;
  readonly width: number;
}

/** The visible rows of a scrolled body and the offset they start at. */
export interface ScrolledBody {
  readonly lines: string[];
  readonly scrollOffset: number;
}

/** Hints a dialog adds to its footer when its body scrolls. */
const SCROLL_KEY_HINTS = ["↑/↓ Scroll", "PgUp/PgDn Page"] as const;

/** Separator placed between two footer key hints. */
const KEY_HINT_SEPARATOR = " · ";

/** Center `text` within `width` visible columns, truncating if it overflows. */
export function centerText(text: string, width: number): string {
  const textWidth = visibleWidth(text);

  if (textWidth >= width) return truncateToWidth(text, width, "…");

  const leftPadding = Math.floor((width - textWidth) / 2);
  const rightPadding = width - textWidth - leftPadding;

  return `${" ".repeat(leftPadding)}${text}${" ".repeat(rightPadding)}`;
}

/**
 * Wrap content in a left and right border, padding or truncating it to the
 * requested width. Width counts visible columns, so ANSI escape sequences
 * do not push the right border out of alignment.
 */
export function frameLine(content: string, width: number): string {
  if (width <= 2) return truncateToWidth("││", width, "");

  return `│${padToWidth(content, width - 2)}│`;
}

/**
 * Render a `left + fill + right` border segment, for example `┌────┐`.
 * A width too narrow for any fill falls back to a truncated `leftright`
 * pair.
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

/** Truncate `text` to `width` visible columns, then pad it back out. */
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
 * Render a bordered dialog with a centered title, body, and footer that
 * fits in `maxHeight` lines. The footer wraps instead of truncating, and a
 * body that does not fit scrolls, with `↑`/`↓` edge markers and scroll hints
 * added to the footer.
 */
export function renderDialogFrame(options: DialogFrameOptions): DialogFrame {
  const frameWidth = Math.max(2, options.width);
  const bodyWidth = Math.max(1, frameWidth - 2);
  const pinnedLines = options.pinnedLines ?? [];
  // Top border, title, blank spacer, and bottom border.
  const chromeLines = 4 + pinnedLines.length;
  const bodyRowsFor = (footerLineCount: number): number =>
    Math.max(1, options.maxHeight - chromeLines - footerLineCount);
  let footerLines = wrapKeyHints(options.footerHints, bodyWidth);

  if (options.bodyLines.length > bodyRowsFor(footerLines.length)) {
    footerLines = wrapKeyHints(
      [...SCROLL_KEY_HINTS, ...options.footerHints],
      bodyWidth,
    );
  }

  const bodyRows = Math.min(
    options.bodyLines.length,
    bodyRowsFor(footerLines.length),
  );
  const body = scrollBody(
    options.bodyLines,
    bodyRows,
    options.scrollOffset,
    bodyWidth,
    (marker) => options.theme.fg("dim", marker),
  );
  const lines = [
    frameSegment("┌", "─", "┐", frameWidth),
    frameLine(centerText(options.title, bodyWidth), frameWidth),
    frameLine("", frameWidth),
    ...body.lines.map((line) => frameLine(line, frameWidth)),
    ...pinnedLines.map((line) => frameLine(line, frameWidth)),
    ...footerLines.map((line) =>
      frameLine(options.theme.fg("dim", line), frameWidth),
    ),
    frameSegment("└", "─", "┘", frameWidth),
  ];

  return {
    bodyRows,
    lines: lines.map((line) => truncateToWidth(line, frameWidth, "")),
    scrollOffset: body.scrollOffset,
  };
}

/**
 * Return the height Pi gives an overlay that asks for `maxHeightPercent` of
 * a terminal `terminalRows` tall with `margin` rows kept free above and
 * below, matching how pi-tui resolves `maxHeight`.
 */
export function resolveOverlayHeight(
  terminalRows: number,
  maxHeightPercent: number,
  margin: number,
): number {
  const requested = Math.floor((terminalRows * maxHeightPercent) / 100);

  return Math.max(1, Math.min(requested, terminalRows - margin * 2));
}

/**
 * Show `rows` lines of `lines` from `scrollOffset`, clamped so the window
 * never runs past either end. When lines are hidden above or below, the
 * right edge of the first or last visible row carries an `↑` or `↓` marker
 * styled by `styleMarker`.
 */
export function scrollBody(
  lines: readonly string[],
  rows: number,
  scrollOffset: number,
  width: number,
  styleMarker: (marker: string) => string,
): ScrolledBody {
  const visibleRows = Math.max(0, Math.min(rows, lines.length));
  const maxOffset = lines.length - visibleRows;
  const offset = Math.max(0, Math.min(scrollOffset, maxOffset));
  const visible = lines.slice(offset, offset + visibleRows);

  if (visible.length === 0 || width < 2) {
    return { lines: visible, scrollOffset: offset };
  }

  const mark = (line: string, marker: string): string =>
    `${padToWidth(line, width - 1)}${styleMarker(marker)}`;
  const lastIndex = visible.length - 1;
  const above = offset > 0;
  const below = offset < maxOffset;

  if (visible.length === 1 && above && below) {
    visible[0] = mark(visible[0] ?? "", "↕");
  } else {
    if (above) visible[0] = mark(visible[0] ?? "", "↑");
    if (below) visible[lastIndex] = mark(visible[lastIndex] ?? "", "↓");
  }

  return { lines: visible, scrollOffset: offset };
}

/**
 * Return the scroll offset closest to `scrollOffset` that shows the lines
 * from `start` to the exclusive `end` in a window of `rows` lines. A range
 * taller than the window shows its first line.
 */
export function scrollOffsetShowing(
  scrollOffset: number,
  rows: number,
  start: number,
  end: number,
): number {
  if (start < scrollOffset || end - start > rows) return start;
  if (end > scrollOffset + rows) return end - rows;

  return scrollOffset;
}

/** Wrap dialog body text to `width` columns, preserving ANSI sequences. */
export function wrapBody(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width));
}

/**
 * Lay out footer key hints on as many lines as `width` needs, breaking
 * only between hints so none is cut. Each line starts with one space of
 * padding. Only a single hint wider than the line itself is truncated.
 */
export function wrapKeyHints(
  hints: readonly string[],
  width: number,
): string[] {
  const available = Math.max(1, width - 1);
  const lines: string[] = [];
  let current = "";

  for (const hint of hints) {
    const joined =
      current.length === 0 ? hint : `${current}${KEY_HINT_SEPARATOR}${hint}`;

    if (current.length > 0 && visibleWidth(joined) > available) {
      lines.push(current);
      current = hint;
    } else {
      current = joined;
    }
  }

  if (current.length > 0) lines.push(current);

  return lines.map((line) => ` ${truncateToWidth(line, available, "…")}`);
}
