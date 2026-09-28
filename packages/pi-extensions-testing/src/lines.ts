/**
 * Checks rendered lines against the width they were rendered for, and
 * strips styling so tests can assert on plain text.
 *
 * Pi stops the TUI with an error when a line in its main screen is wider
 * than the terminal, and cuts overlay lines off, so every render test at
 * a narrow width asserts that this finds nothing.
 */

import { visibleWidth } from "@earendil-works/pi-tui";

/** A rendered line wider than the width it was rendered for. */
export interface OverflowingLine {
  /** Index of the line in the rendered output. */
  readonly index: number;
  readonly line: string;
  /** The line's width in visual columns. */
  readonly width: number;
}

/**
 * Every line of `lines` wider than `width` visual columns, measured with
 * `visibleWidth` so styling escapes do not count. Expect it to return
 * `[]`.
 */
export function findOverflowingLines(
  lines: readonly string[],
  width: number,
): OverflowingLine[] {
  return lines.flatMap((line, index) => {
    const lineWidth = visibleWidth(line);

    return lineWidth > width ? [{ index, line, width: lineWidth }] : [];
  });
}

/** `text` without its SGR color and style sequences. */
export function stripAnsi(text: string): string {
  return text.replaceAll(SGR_PATTERN, "");
}

/** An SGR sequence such as `ESC[31m` or `ESC[0m`. */
const SGR_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
