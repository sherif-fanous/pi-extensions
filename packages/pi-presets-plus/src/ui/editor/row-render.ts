/**
 * Render primitives the editor rows share: the label and value line, the
 * choice line, the text-input line, and the diagnostic line beneath a row.
 */
import type { EditorRowId } from "../editor-types.js";
import type { EditorRowHost } from "./row.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  visibleWidth,
  wrapTextWithAnsi,
  type Input,
} from "@earendil-works/pi-tui";

/** Columns the label takes, padded, in characters. */
const EDITOR_LABEL_WIDTH = 15;
/** Column the value starts at: the focus marker, a space, and the label. */
const EDITOR_VALUE_COLUMN = EDITOR_LABEL_WIDTH + 2;

/** Space between two options or tools on a line. */
const TOKEN_SEPARATOR = "  ";

/** Stand-in text shown for an empty value. */
export const EMPTY_INPUT_PLACEHOLDER = "(empty)";

/**
 * Lay `tokens` out on as many lines of `width` columns as they need,
 * breaking only between two tokens, so the cursor never moves onto an
 * option cut off at the right edge. A token wider than a whole line wraps
 * onto lines of its own.
 */
export function packTokens(tokens: readonly string[], width: number): string[] {
  const lineWidth = Math.max(1, width);
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    if (visibleWidth(token) > lineWidth) {
      if (current.length > 0) lines.push(current);
      lines.push(...wrapTextWithAnsi(token, lineWidth));
      current = "";

      continue;
    }

    const joined =
      current.length === 0 ? token : `${current}${TOKEN_SEPARATOR}${token}`;

    if (current.length > 0 && visibleWidth(joined) > lineWidth) {
      lines.push(current);
      current = token;
    } else {
      current = joined;
    }
  }

  if (current.length > 0) lines.push(current);

  return lines;
}

/**
 * Render a row whose value is one option out of a small set, `●` before
 * the chosen option and `○` before the others, wrapped onto more lines
 * when the options do not fit `width`.
 */
export function renderChoiceRow(
  theme: Pick<Theme, "fg">,
  label: string,
  options: readonly string[],
  selected: string,
  focused: boolean,
  width: number,
): string[] {
  return renderWrappedValueRow(
    theme,
    label,
    options.map((option) =>
      option === selected ? `● ${option}` : `○ ${option}`,
    ),
    focused,
    width,
  );
}

/**
 * Render a single-line text-input row: the live `Input` widget while the
 * row has focus, otherwise the value or a dim placeholder when it is empty.
 */
export function renderTextInputRow(
  host: EditorRowHost,
  label: string,
  row: Extract<EditorRowId, "hotkey" | "name">,
  input: Input,
  text: string,
  width: number,
): string[] {
  const focused = host.currentRow() === row;

  if (focused) {
    return withFieldDiagnostic(
      host,
      row,
      renderValueRow(
        host.theme,
        label,
        input.render(valueWidth(width))[0] ?? "",
        true,
      ),
    );
  }

  const value =
    text.length > 0 ? text : host.theme.fg("dim", EMPTY_INPUT_PLACEHOLDER);

  return withFieldDiagnostic(
    host,
    row,
    renderValueRow(host.theme, label, value, false),
  );
}

/** Render the focus marker, padded label, and value as one line. */
export function renderValueRow(
  theme: Pick<Theme, "fg">,
  label: string,
  value: string,
  focused: boolean,
): string {
  const marker = focused ? theme.fg("accent", "▌") : " ";
  const paddedLabel = `${label}${" ".repeat(Math.max(0, EDITOR_LABEL_WIDTH - label.length))}`;
  const labelText = theme.fg("muted", paddedLabel);
  const renderedValue = focused ? theme.fg("accent", value) : value;

  return `${marker} ${labelText}${renderedValue}`;
}

/**
 * Render a row whose value is a list of `tokens`, wrapped between tokens
 * onto lines that start at the value column.
 */
export function renderWrappedValueRow(
  theme: Pick<Theme, "fg">,
  label: string,
  tokens: readonly string[],
  focused: boolean,
  width: number,
): string[] {
  const indent = " ".repeat(EDITOR_VALUE_COLUMN);

  return packTokens(tokens, valueWidth(width)).map((line, index) => {
    if (index === 0) return renderValueRow(theme, label, line, focused);

    return `${indent}${focused ? theme.fg("accent", line) : line}`;
  });
}

/** Columns left for a row's value in a row `width` columns wide. */
export function valueWidth(width: number): number {
  return Math.max(1, width - EDITOR_VALUE_COLUMN);
}

/**
 * Append the row's diagnostic message beneath `line` or its lines when
 * the host holds one for it.
 */
export function withFieldDiagnostic(
  host: EditorRowHost,
  row: EditorRowId,
  line: string | readonly string[],
): string[] {
  const lines = typeof line === "string" ? [line] : [...line];
  const diagnostic = renderFieldDiagnostic(host, row);

  return diagnostic ? [...lines, diagnostic] : lines;
}

/**
 * Step an index one place in `direction`, wrapping around the ends of a
 * list of `length` items.
 */
export function wrapIndex(
  currentIndex: number,
  length: number,
  direction: -1 | 1,
): number {
  if (length <= 0) return 0;

  return (((currentIndex + direction) % length) + length) % length;
}

/** Render the host's diagnostic for `row` as a colored, indented line. */
function renderFieldDiagnostic(
  host: EditorRowHost,
  row: EditorRowId,
): string | undefined {
  const diagnostic = host.getFieldDiagnostic(row);

  if (!diagnostic) return undefined;

  const color = diagnostic.severity === "warning" ? "warning" : "error";

  return host.theme.fg(color, `    ${diagnostic.message}`);
}
