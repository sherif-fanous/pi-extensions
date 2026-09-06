/**
 * Severity presentation shared by the toast stack and the history browser.
 *
 * Owns the theme color carried by each severity and the label text each
 * surface draws for it. It does NOT own framing, layout, width
 * arithmetic, theme construction, or the decision of where a label is
 * placed; callers style and position the values they take from here.
 *
 * Both surfaces read the color from this one map because a severity that
 * looked different between a toast and its history row would read as two
 * different events.
 */

import type { NotificationSeverity } from "../types.js";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";

/** Theme color carried by each severity on every surface. */
export const SEVERITY_COLORS: Readonly<
  Record<NotificationSeverity, ThemeColor>
> = {
  // "warning" is the theme's amber; "error" is its red.
  error: "error",
  info: "accent",
  warning: "warning",
};

/**
 * Severity labels for history list rows.
 *
 * Upper case and abbreviated to a fixed width so the column stays
 * aligned down the list. The card labels below differ deliberately.
 */
export const ROW_SEVERITY_LABELS: Readonly<
  Record<NotificationSeverity, string>
> = {
  error: "ERROR",
  info: "INFO",
  warning: "WARN",
};

/**
 * Severity labels for toast cards.
 *
 * Title case and unabbreviated because a card label sits alone in the
 * top border, where nothing needs to align and there is room to spell
 * the word out.
 */
export const CARD_SEVERITY_LABELS: Readonly<
  Record<NotificationSeverity, string>
> = {
  error: "Error",
  info: "Info",
  warning: "Warning",
};

/**
 * Columns a row label occupies.
 *
 * Describes {@link ROW_SEVERITY_LABELS} only. Card labels are not padded
 * to a common width, so this does not apply to them.
 */
export const SEVERITY_LABEL_WIDTH = 5;
