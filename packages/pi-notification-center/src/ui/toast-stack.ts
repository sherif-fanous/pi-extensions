/**
 * Passive toast-stack presentation.
 *
 * Owns the visual shape of the toast stack: card framing, message
 * wrapping across a bounded number of body rows, visual-width
 * truncation, and the size guards that decide how much of the stack can
 * be shown. It does NOT own timers, eviction, the render surface,
 * history, or the severity colors and labels it draws — callers supply
 * the already-bounded list of visible notifications.
 *
 * `toast.width` is a maximum rather than a fixed size. Cards are sized to
 * the widest message on show, so a short notification stays small instead
 * of drawing a mostly empty box over the transcript, and one width is
 * used for the whole stack so right-anchored cards keep a straight edge.
 *
 * Rendering is split into a pure `renderToastStack` function and a thin
 * component wrapper so tests can assert on exact lines and widths
 * without constructing a TUI.
 */

import type { NotificationConfig, NotificationEntry } from "../types.js";
import {
  FRAME_BODY_CHROME_COLUMNS,
  frameLine,
  frameSegment,
  padToWidth,
} from "./frame.js";
import { CARD_SEVERITY_LABELS, SEVERITY_COLORS } from "./severity.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
} from "@earendil-works/pi-tui";

/** Minimal theme surface used by the stack, so tests can pass a fake. */
export type ToastTheme = Pick<Theme, "bold" | "fg">;

/**
 * Component that renders the current visible toasts.
 *
 * The visible list is owned by the manager and mutated in place through
 * {@link setToasts}; the component itself holds no lifecycle state, which
 * keeps expiration logic in exactly one place.
 */
export class ToastStackComponent implements Component {
  private toasts: readonly NotificationEntry[] = [];

  constructor(
    private readonly theme: ToastTheme,
    private readonly config: NotificationConfig,
    private readonly terminalSize: () => {
      height: number;
      width: number;
    },
  ) {}

  invalidate(): void {
    // No cached layout: every render recomputes from the current list.
  }

  render(width: number): string[] {
    const { height, width: termWidth } = this.terminalSize();

    return renderToastStack(this.toasts, this.theme, this.config, {
      terminalHeight: height,
      terminalWidth: termWidth,
      viewportWidth: width,
    });
  }

  /** Replace the visible list. The caller requests a render afterwards. */
  setToasts(toasts: readonly NotificationEntry[]): void {
    this.toasts = toasts;
  }
}

/** Rows of framing every card carries, regardless of body height. */
export const TOAST_FRAME_ROWS = 2;

/** Smallest terminal height that can safely show a one-row card. */
const MIN_TERMINAL_HEIGHT = TOAST_FRAME_ROWS + 2;

/**
 * Whether a toast surface fits the current terminal.
 *
 * Used both as the overlay's `visible` predicate and as a pre-render
 * guard, so an undersized terminal silently omits presentation instead of
 * drawing a broken frame. History is unaffected either way.
 *
 * The bound is the narrowest legible card, not the configured width,
 * because cards shrink to the terminal. A wide `toast.width` on a narrow
 * terminal yields narrow cards rather than no cards at all.
 */
export function canRenderToasts(
  terminalWidth: number,
  terminalHeight: number,
): boolean {
  return (
    terminalHeight >= MIN_TERMINAL_HEIGHT &&
    terminalWidth >= MIN_TOAST_WIDTH + TOAST_HORIZONTAL_MARGIN
  );
}

/**
 * Render the visible stack, newest card at the bottom.
 *
 * Cards appear in arrival order so the stack grows downward from the
 * top-right anchor. Cards are variable height, so when the stack would be
 * taller than the terminal the newest cards win: a toast that just
 * arrived is the one the user is most likely waiting to read. Returns an
 * empty array when there is nothing to show or when the terminal cannot
 * safely host the surface.
 *
 * Every returned line spans the full granted viewport width, with the
 * card flush against its right edge and blank columns to its left.
 */
export function renderToastStack(
  toasts: readonly NotificationEntry[],
  theme: ToastTheme,
  config: NotificationConfig,
  viewport: {
    terminalHeight: number;
    terminalWidth: number;
    viewportWidth: number;
  },
): string[] {
  if (toasts.length === 0) return [];

  if (!canRenderToasts(viewport.terminalWidth, viewport.terminalHeight)) {
    return [];
  }

  const candidates = toasts.slice(-config.maxToastsVisible);
  // Never exceed the configured maximum or the width the surface granted
  // us, and never fall below the width where framing stops being
  // legible. Between those bounds the widest message decides.
  //
  // The terminal is not bounded again here. Pi re-resolves the surface's
  // width against the current terminal on every render, so the width we
  // were granted already accounts for the margin and for any resize.
  // Subtracting the margin a second time left the card one column short
  // of its own region on terminals narrow enough for that to bind.
  const cardWidth = Math.max(
    MIN_TOAST_WIDTH,
    Math.min(
      config.toast.width,
      viewport.viewportWidth,
      naturalCardWidth(candidates),
    ),
  );
  // The overlay floats over the transcript, so bound the stack to half
  // the terminal height rather than covering the conversation.
  const rowBudget = Math.max(
    TOAST_FRAME_ROWS + 1,
    Math.floor(viewport.terminalHeight / 2),
  );
  const cards: string[][] = [];

  let usedRows = 0;

  // Walk newest first so the cards that survive a height shortfall are
  // the most recent ones, then restore arrival order for display.
  for (const toast of [...candidates].reverse()) {
    const card = renderCard(toast, theme, config, cardWidth);

    if (usedRows + card.length > rowBudget) break;

    usedRows += card.length;
    cards.unshift(card);
  }

  // The surface is anchored by the width it was created with, not by the
  // width actually drawn, so a card narrower than the surface would float
  // mid-screen instead of sitting at the right edge. Pad on the left to
  // put the card's right edge where the anchor is. The blank columns cost
  // nothing: the surface already clears its full width on every render.
  const gutter = " ".repeat(Math.max(0, viewport.viewportWidth - cardWidth));

  return cards
    .flat()
    .map((line) => `${gutter}${truncateToWidth(line, cardWidth, "")}`);
}

/**
 * Wrap a message into at most `maxLines` display rows.
 *
 * The message's own line breaks are preserved, so a summary line followed
 * by bullets keeps its shape instead of being flattened into one run of
 * text, and a blank line the author wrote still occupies a row. Styling
 * that spans a line break continues onto the rows below it. When the
 * message needs more rows than allowed, the final kept row is marked with
 * an ellipsis; `/notifications` remains the complete record.
 */
export function toBodyLines(
  message: string,
  width: number,
  maxLines: number,
): string[] {
  const limit = Math.max(1, maxLines);
  const lines = wrapTextWithAnsi(message, width);

  if (lines.length <= limit) return lines;

  const kept = lines.slice(0, limit);
  const last = kept[limit - 1] ?? "";

  kept[limit - 1] = `${truncateToWidth(last, Math.max(1, width - 1), "")}…`;

  return kept;
}

/**
 * Columns reserved so a card never touches the terminal's right edge.
 *
 * Stated once and handed to Pi as the surface's right margin, so the
 * width guard here and the region Pi anchors cannot disagree.
 */
export const TOAST_HORIZONTAL_MARGIN = 1;

/** Narrowest card that still fits a border, a label, and some text. */
const MIN_TOAST_WIDTH = 20;

/**
 * Width the widest message would need to avoid wrapping.
 *
 * Measured per line so a multiline message is sized by its longest line,
 * and in visual columns because a message may already carry styling.
 */
function naturalCardWidth(toasts: readonly NotificationEntry[]): number {
  let widest = 0;

  for (const toast of toasts) {
    for (const line of toast.message.split("\n")) {
      widest = Math.max(widest, visibleWidth(line));
    }
  }

  return widest + FRAME_BODY_CHROME_COLUMNS;
}

function renderCard(
  toast: NotificationEntry,
  theme: ToastTheme,
  config: NotificationConfig,
  width: number,
): string[] {
  const color = SEVERITY_COLORS[toast.severity];
  const label = CARD_SEVERITY_LABELS[toast.severity];
  const bodyWidth = Math.max(1, width - FRAME_BODY_CHROME_COLUMNS);
  const body = toBodyLines(toast.message, bodyWidth, config.toast.maxLines);
  // The label is drawn into the top border, so its plain-text width is
  // measured before styling to keep the fill count correct.
  const labelText = ` ${label} `;
  const fillWidth = Math.max(0, width - 2 - visibleWidth(labelText));
  const top =
    fillWidth > 0
      ? `┌${theme.fg(color, theme.bold(labelText))}${"─".repeat(fillWidth)}┐`
      : frameSegment("┌", "┐", width);

  return [
    top,
    ...body.map((line) =>
      frameLine(` ${theme.fg(color, padToWidth(line, bodyWidth))} `, width),
    ),
    frameSegment("└", "┘", width),
  ];
}
