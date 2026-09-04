/**
 * Pure formatting for the notification-history browser.
 *
 * Owns entry ordering, severity colors and labels, the one-line list row,
 * the detail body, its scroll indicators, and the empty state. It does NOT
 * own scrolling itself, selection, keyboard handling, framing, or session
 * access.
 *
 * Kept free of TUI state so tests can pin a locale, time zone, width, and
 * a colorless theme and assert on exact output.
 */

import type { NotificationEntry, NotificationSeverity } from "../types.js";
import { padToWidth } from "./frame.js";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Locale and time-zone inputs, injectable so tests stay deterministic. */
export interface HistoryTimeOptions {
  locale?: Intl.LocalesArgument;
  timeZone?: string;
}

/** Minimal theme surface used by the formatter, so tests can pass a fake. */
export type HistoryTheme = Pick<Theme, "bg" | "bold" | "fg">;

/** Shown when the active session branch holds no notifications. */
export const HISTORY_EMPTY_MESSAGE =
  "No notifications have been captured in this session yet.";

/** Theme color used for each severity, ordered least to most urgent. */
export const SEVERITY_COLORS: Readonly<
  Record<NotificationSeverity, ThemeColor>
> = {
  // "warning" is the theme's amber; "error" is its red.
  error: "error",
  info: "accent",
  warning: "warning",
};

/** Fixed-width severity labels, so list rows align in a column. */
export const SEVERITY_LABELS: Readonly<Record<NotificationSeverity, string>> = {
  error: "ERROR",
  info: "INFO",
  warning: "WARN",
};

/** Columns a severity label occupies in a list row. */
export const SEVERITY_LABEL_WIDTH = 5;

/** Name of the detail pane, with or without a scroll position. */
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
 * A message that fits says nothing, so the position appears only when it
 * is actionable. When it does not fit, the range answers both "is there
 * more" and "am I at the end", which the footer hint alone cannot.
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
 * Shows the full local date and time, the severity, and the complete
 * message wrapped to the pane width. Messages are never truncated here:
 * the caller scrolls, so nothing is lost.
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
    theme.fg(color, theme.bold(SEVERITY_LABELS[entry.severity])),
    "",
  ];

  for (const paragraph of entry.message.split("\n")) {
    // An empty paragraph still occupies a row so the author's own blank
    // lines survive into the detail pane.
    lines.push(
      ...(paragraph === "" ? [""] : wrapTextWithAnsi(paragraph, paneWidth)),
    );
  }

  return lines;
}

/**
 * Format one list row: time, severity, and a single-line message preview.
 *
 * The row is padded to `width` before any selection background is applied
 * so the highlight spans the whole pane rather than stopping at the text.
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
    SEVERITY_LABELS[entry.severity],
    SEVERITY_LABEL_WIDTH,
  );
  // Reserve the time, label, and two single-space gaps.
  const previewWidth = Math.max(
    1,
    rowWidth - time.length - SEVERITY_LABEL_WIDTH - 2,
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
  // would clear the background mid-row. Re-open the background after every
  // reset so the highlight covers the whole pane.
  return theme.bg(
    "selectedBg",
    row.replaceAll(SGR_RESET, `${SGR_RESET}${theme.bg("selectedBg", "")}`),
  );
}

/**
 * Mark the visible detail rows that have more content beyond them.
 *
 * The pane otherwise cuts at a row boundary with no sign of it, so a
 * message that happens to break after a sentence reads as complete, and
 * a scrolled pane gives no hint that its start is off screen. Markers sit
 * at the right edge, where they read as a scroll column rather than as
 * part of the message. Both edges are marked, because after one page down
 * the content above is exactly as hidden as the content below was.
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

  // A single row carries both directions at once, since it is the first
  // and last visible row.
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
