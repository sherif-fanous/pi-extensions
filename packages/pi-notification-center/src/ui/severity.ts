/**
 * The theme color each severity carries and the label text each surface
 * draws for it.
 *
 * Toasts and history rows read the color from the same map, so one
 * notification looks like one event on both surfaces. Callers style and
 * position what they take from here.
 */

import type { NotificationSeverity } from "../types.js";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";

/** Theme color carried by each severity on every surface. */
export const SEVERITY_COLORS: Readonly<
  Record<NotificationSeverity, ThemeColor>
> = {
  error: "error",
  info: "accent",
  warning: "warning",
};

/**
 * Severity labels for history list rows, upper case and abbreviated to a
 * fixed width so the column stays aligned down the list.
 */
export const ROW_SEVERITY_LABELS: Readonly<
  Record<NotificationSeverity, string>
> = {
  error: "ERROR",
  info: "INFO",
  warning: "WARN",
};

/**
 * Severity labels for toast cards, title case and spelled out because a
 * card label sits alone in the top border with nothing to align to.
 */
export const CARD_SEVERITY_LABELS: Readonly<
  Record<NotificationSeverity, string>
> = {
  error: "Error",
  info: "Info",
  warning: "Warning",
};

/**
 * Columns a row label occupies. Applies to {@link ROW_SEVERITY_LABELS}
 * only; card labels are not padded to a common width.
 */
export const SEVERITY_LABEL_WIDTH = 5;
