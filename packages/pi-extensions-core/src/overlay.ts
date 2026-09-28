/**
 * The two overlay sizes every extension opens: `main` for a top-level
 * surface (a picker, browser, editor, or config form) and `nested` for a
 * dialog opened from one (a confirmation, info text, or a sub-selector).
 */

import type { OverlayOptions } from "@earendil-works/pi-tui";

/** Which of the two family overlay sizes to open. */
export type OverlaySize = "main" | "nested";

/** Columns and rows kept free between the overlay and the terminal edge. */
const OVERLAY_MARGIN = 1;
const MAX_HEIGHT_PERCENT = 80;
const SIZES: Readonly<
  Record<OverlaySize, { minWidth: number; widthPercent: number }>
> = {
  main: { minWidth: 60, widthPercent: 80 },
  nested: { minWidth: 48, widthPercent: 50 },
};

/**
 * The rows Pi gives an overlay of either size on a terminal
 * `terminalRows` tall: 80% of the height, never more than the rows inside
 * the margins, and at least 1, resolved the way pi-tui resolves
 * `maxHeight`.
 *
 * A surface lays itself out to this height and scrolls anything taller,
 * because Pi keeps only the top rows of a taller render.
 */
export function overlayMaxHeight(terminalRows: number): number {
  const requested = Math.floor((terminalRows * MAX_HEIGHT_PERCENT) / 100);

  return Math.max(1, Math.min(requested, terminalRows - OVERLAY_MARGIN * 2));
}

/**
 * The `overlayOptions` for `ctx.ui.custom`: centered with a margin of 1,
 * 80% wide (at least 60 columns) for `main` or 50% wide (at least 48)
 * for `nested`, and at most 80% of the terminal height. Spread the
 * result to add options such as `visible`.
 */
export function overlayOptions(size: OverlaySize): OverlayOptions {
  const { minWidth, widthPercent } = SIZES[size];

  return {
    anchor: "center",
    margin: OVERLAY_MARGIN,
    maxHeight: `${MAX_HEIGHT_PERCENT}%`,
    minWidth,
    width: `${widthPercent}%`,
  };
}
