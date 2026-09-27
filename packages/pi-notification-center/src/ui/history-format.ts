/**
 * Formatting for the history browser: the one-line list row, the detail
 * body, its scroll markers, and the empty state.
 *
 * Every function is pure and free of TUI state, so tests can pin a
 * locale, time zone, width, and colorless theme and assert on exact
 * output.
 */

import type { NotificationEntry } from "../types.js";
import { padToWidth } from "./frame.js";
import {
  ROW_SEVERITY_LABELS,
  SEVERITY_COLORS,
  SEVERITY_LABEL_WIDTH,
} from "./severity.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

/** Locale and time zone, injected so tests stay deterministic. */
export interface HistoryTimeOptions {
  locale?: Intl.LocalesArgument;
  timeZone?: string;
}

/** Theme surface used by the formatter, so tests can pass a fake. */
export type HistoryTheme = Pick<Theme, "bg" | "bold" | "fg">;

/** Shown when the active session branch holds no notifications. */
export const HISTORY_EMPTY_MESSAGE =
  "No notifications have been captured in this session yet.";

/** Name of the detail pane. */
const DETAIL_TITLE = "Detail";

/** Drawn at the right edge of the first row when content sits above it. */
const DETAIL_ABOVE_MARKER = "↑";

/** Drawn at the right edge of the last row when content follows it. */
const DETAIL_BELOW_MARKER = "↓";

/** Drawn when a one-row pane has content on both sides. */
const DETAIL_BOTH_MARKER = "↕";

/**
 * Title for the detail pane, carrying its scroll position.
 *
 * A message that fits its pane gets the bare title, since there is no
 * position to report.
 */
export function formatDetailTitle(
  offset: number,
  rows: number,
  total: number,
): string {
  if (total <= rows) return DETAIL_TITLE;

  const first = Math.min(offset + 1, total);
  const last = Math.min(offset + rows, total);

  return `${DETAIL_TITLE} ${String(first)}-${String(last)}/${String(total)}`;
}

/**
 * Format the detail pane for one entry.
 *
 * Shows the full local date and time, the severity, and the whole message
 * wrapped to the pane width. The message keeps its own line breaks and
 * blank rows, and styling that spans a break continues onto the rows
 * below. Nothing is truncated, because the caller scrolls.
 */
export function formatHistoryDetail(
  entry: NotificationEntry,
  theme: HistoryTheme,
  width: number,
  options: HistoryTimeOptions = {},
): string[] {
  const paneWidth = Math.max(1, width);
  const color = SEVERITY_COLORS[entry.severity];
  const lines = [
    theme.fg("dim", formatDateTime(entry.timestamp, options)),
    theme.fg(color, theme.bold(ROW_SEVERITY_LABELS[entry.severity])),
    "",
  ];

  lines.push(...wrapTextWithAnsi(entry.message, paneWidth));

  return lines;
}

/**
 * Format one list row: time, severity, and a single-line message preview.
 *
 * The row is padded to `width` before the selection background is
 * applied, so the highlight spans the pane rather than stopping at the
 * text.
 */
export function formatHistoryRow(
  entry: NotificationEntry,
  theme: HistoryTheme,
  width: number,
  options: HistoryTimeOptions & { selected?: boolean } = {},
): string {
  const rowWidth = Math.max(1, width);
  const color = SEVERITY_COLORS[entry.severity];
  const time = formatTime(entry.timestamp, options);
  const label = padToWidth(
    ROW_SEVERITY_LABELS[entry.severity],
    SEVERITY_LABEL_WIDTH,
  );
  // Reserve the time, the label, and two single-space gaps. The time is
  // measured in columns because some numbering systems format the hour in
  // wide digits.
  const previewWidth = Math.max(
    1,
    rowWidth - visibleWidth(time) - SEVERITY_LABEL_WIDTH - 2,
  );
  const preview = truncateToWidth(
    toPreviewLine(entry.message),
    previewWidth,
    "…",
  );
  const row = padToWidth(
    `${theme.fg("dim", time)} ${theme.fg(color, theme.bold(label))} ${preview}`,
    rowWidth,
  );

  if (!options.selected) return row;

  // `truncateToWidth` emits a full SGR reset around its ellipsis, which
  // clears the background mid-row. Re-open the background after every
  // reset so the highlight covers the whole pane.
  return theme.bg(
    "selectedBg",
    row.replaceAll(SGR_RESET, `${SGR_RESET}${theme.bg("selectedBg", "")}`),
  );
}

/**
 * Mark the visible detail rows that have more content beyond them.
 *
 * A marker sits at the right edge of the first row when content is
 * scrolled above it and of the last row when content follows, where it
 * reads as a scroll column rather than as part of the message.
 */
export function markDetailScroll(
  lines: readonly string[],
  theme: HistoryTheme,
  width: number,
  edges: { above: boolean; below: boolean },
): string[] {
  const rows = [...lines];

  if (rows.length === 0 || width < 2 || (!edges.above && !edges.below)) {
    return rows;
  }

  const mark = (row: string, marker: string): string =>
    `${padToWidth(row, width - 1)}${theme.fg("dim", marker)}`;

  // A lone row is both the first and the last visible row, so it carries
  // both directions at once.
  if (rows.length === 1) {
    return [
      mark(
        rows[0] ?? "",
        edges.above && edges.below
          ? DETAIL_BOTH_MARKER
          : edges.above
            ? DETAIL_ABOVE_MARKER
            : DETAIL_BELOW_MARKER,
      ),
    ];
  }

  if (edges.above) rows[0] = mark(rows[0] ?? "", DETAIL_ABOVE_MARKER);

  if (edges.below) {
    rows[rows.length - 1] = mark(
      rows[rows.length - 1] ?? "",
      DETAIL_BELOW_MARKER,
    );
  }

  return rows;
}

/** Full SGR reset, as emitted by the TUI's truncation helper. */
const SGR_RESET = "\u001B[0m";

/** Collapse a message to one line for a list row. */
export function toPreviewLine(message: string): string {
  return message.replace(/\s+/gu, " ").trim();
}

function formatDateTime(
  timestamp: number,
  options: HistoryTimeOptions,
): string {
  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  }).format(new Date(timestamp));
}

function formatTime(timestamp: number, options: HistoryTimeOptions): string {
  return new Intl.DateTimeFormat(options.locale, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  }).format(new Date(timestamp));
}
