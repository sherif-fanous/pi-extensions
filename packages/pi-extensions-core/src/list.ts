/**
 * The family's list model: ↑/↓ wrap around, PgUp/PgDn move one page and
 * stop at the ends, the window keeps the selection centered, and a list
 * that does not fit shows a `(n/m)` position. Also the scrolled text
 * body with edge markers, and the empty-state line.
 */

import { padToWidth } from "./frame.js";
import type { SelectAction } from "./key-hints.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** The rows of a list to draw, from {@link listWindow}. */
export interface ListWindow {
  /** One past the last visible index. */
  readonly end: number;
  /** `(n/m)` when the list has more items than rows, else `undefined`. */
  readonly position: string | undefined;
  /** First visible index. */
  readonly start: number;
}

/** The visible rows of a scrolled body, from {@link scrollLines}. */
export interface ScrolledLines {
  readonly lines: string[];
  /** The offset clamped into range; store it for the next render. */
  readonly offset: number;
}

/** A selection move: the movement actions of {@link SelectAction}. */
export type ListMove = Extract<
  SelectAction,
  "down" | "pageDown" | "pageUp" | "up"
>;

/**
 * An empty or no-match state as muted body rows wrapped to `width`.
 *
 * `message` is a whole sentence that says what is empty, followed by the
 * next step when there is one: `No presets yet. Press n to create one.`
 */
export function emptyStateLines(
  message: string,
  width: number,
  theme: Pick<Theme, "fg">,
): string[] {
  return wrapTextWithAnsi(theme.fg("muted", message), Math.max(1, width));
}

/** The 1-based position of `selected` in `count` items: `(3/12)`. */
export function listPosition(selected: number, count: number): string {
  return `(${String(selected + 1)}/${String(count)})`;
}

/**
 * The window of `rows` items to draw for a list of `count` items, with
 * `selected` centered where the ends allow, as Pi's own lists do.
 */
export function listWindow(
  selected: number,
  count: number,
  rows: number,
): ListWindow {
  const visibleRows = Math.max(0, Math.min(rows, count));
  const start = Math.max(
    0,
    Math.min(selected - Math.floor(visibleRows / 2), count - visibleRows),
  );

  return {
    end: start + visibleRows,
    position: count > visibleRows ? listPosition(selected, count) : undefined,
    start,
  };
}

/**
 * The index `move` selects in a list of `count` items.
 *
 * ↑/↓ wrap around from one end to the other. PgUp/PgDn move `pageSize`
 * items and stop at the first or last item. An empty list returns 0.
 */
export function moveListSelection(
  selected: number,
  count: number,
  move: ListMove,
  pageSize: number,
): number {
  if (count <= 0) return 0;

  const page = Math.max(1, pageSize);
  const last = count - 1;

  switch (move) {
    case "down":
      return selected >= last ? 0 : selected + 1;
    case "pageDown":
      return Math.min(last, selected + page);
    case "pageUp":
      return Math.max(0, selected - page);
    case "up":
      return selected <= 0 ? last : selected - 1;
  }
}

/**
 * Show `rows` of `lines` from `offset`, clamped so the window never runs
 * past either end, with every row fitted to `width` columns.
 *
 * When lines are hidden, the right edge of the first visible row carries
 * a dim `↑` and the last a dim `↓`; a lone row carries `↕` when lines are
 * hidden on both sides. A width below 2 has no room for a marker.
 */
export function scrollLines(
  lines: readonly string[],
  rows: number,
  offset: number,
  width: number,
  theme: Pick<Theme, "fg">,
): ScrolledLines {
  const visibleRows = Math.max(0, Math.min(rows, lines.length));
  const maxOffset = lines.length - visibleRows;
  const clamped = Math.max(0, Math.min(offset, maxOffset));
  const above = clamped > 0;
  const below = clamped < maxOffset;
  const lastIndex = visibleRows - 1;
  const markerFor = (index: number): string | undefined => {
    const first = index === 0 && above;
    const last = index === lastIndex && below;

    if (width < 2) return undefined;

    if (first && last) return "↕";

    return first ? "↑" : last ? "↓" : undefined;
  };
  const visible = lines
    .slice(clamped, clamped + visibleRows)
    .map((line, index) => {
      const marker = markerFor(index);

      return marker === undefined
        ? truncateToWidth(line, Math.max(0, width), "…")
        : `${padToWidth(line, width - 1)}${theme.fg("dim", marker)}`;
    });

  return { lines: visible, offset: clamped };
}
