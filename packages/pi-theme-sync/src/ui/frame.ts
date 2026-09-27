/** Provides width-safe border, padding, truncation, and wrapping helpers for TUI frames. */

import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

/** Fits every line to the requested visual width. */
export function fitLines(lines: readonly string[], width: number): string[] {
  return lines.map((line) => {
    const fitted = truncateToWidth(line, Math.max(0, width), "");

    return line.includes("\x1b") ? fitted : fitted.replace(/\x1b\[0m$/, "");
  });
}

/** Wraps content in side borders and fits it to the requested visual width. */
export function frameLine(content: string, width: number): string {
  if (width <= 0) return "";
  if (width === 1) return "│";
  if (width === 2) return "││";

  return `│${padToWidth(content, width - 2)}│`;
}

/** Renders a border segment at the requested visual width. */
export function frameSegment(
  left: string,
  fill: string,
  right: string,
  width: number,
): string {
  if (width <= 0) return "";
  if (width === 1) return left;
  if (width === 2) return `${left}${right}`;

  return `${left}${fill.repeat(width - 2)}${right}`;
}

/** Truncates text to a visual width and pads the remaining columns. */
export function padToWidth(
  text: string,
  width: number,
  fill = " ",
  ellipsis = "…",
): string {
  const safeWidth = Math.max(0, width);
  const truncated = truncateToWidth(text, safeWidth, ellipsis);

  return `${truncated}${fill.repeat(Math.max(0, safeWidth - visibleWidth(truncated)))}`;
}

/** Wraps ANSI-styled text without exceeding the requested visual width. */
export function wrapToWidth(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width));
}
