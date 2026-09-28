/**
 * Types and constants shared across the extension: the severity set, the
 * persisted entry payload, and the configuration shape.
 */

/**
 * Resolved Notification Center configuration.
 *
 * Every field is always present. The loader substitutes the default for a
 * missing, malformed, or out-of-range value, so callers never re-apply
 * fallbacks.
 */
export interface NotificationConfig {
  /** Toast cards: how many show at once, and the size and lifetime of each. */
  toast: ToastConfig;
}

/**
 * Payload persisted as a Pi custom session entry.
 *
 * `version` is validated on read, so a payload written under a different
 * shape is rejected instead of misread; a payload without one reads as
 * version 1. The message is stored whole; the
 * bounded height of a toast card is presentation only.
 */
export interface NotificationEntry {
  message: string;
  severity: NotificationSeverity;
  /** Capture time as epoch milliseconds. */
  timestamp: number;
  version: typeof ENTRY_VERSION;
}

/** Toast settings. */
export interface ToastConfig {
  /** Maximum body rows one card may occupy. */
  maxLines: number;
  /** Maximum number of simultaneously visible cards. */
  maxVisible: number;
  /** Card lifetime in milliseconds, measured from arrival. */
  timeoutMs: number;
  /** Widest a card may grow, in terminal columns. */
  width: number;
}

/** Notification severity, mirroring Pi's `ctx.ui.notify` type argument. */
export type NotificationSeverity = "error" | "info" | "warning";

/**
 * Custom session-entry type used for notification history, namespaced so
 * it cannot collide with another extension's session state.
 */
export const CUSTOM_ENTRY_TYPE = "notification-center:entry";

/** Schema version stamped on every persisted notification entry. */
export const ENTRY_VERSION = 1;

/** Every severity, in ascending order of urgency. */
export const SEVERITIES: readonly NotificationSeverity[] = [
  "info",
  "warning",
  "error",
] as const;

/** Narrow an arbitrary value to a supported severity. */
export function isNotificationSeverity(
  value: unknown,
): value is NotificationSeverity {
  return (
    typeof value === "string" &&
    (SEVERITIES as readonly string[]).includes(value)
  );
}
