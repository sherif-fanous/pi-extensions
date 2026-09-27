/**
 * Types and constants shared across the extension: the severity set, the
 * persisted entry payload, the configuration shape, and the defaults and
 * ranges every setting is validated against.
 */

/**
 * Resolved notification-center configuration.
 *
 * Every field is always present. The loader substitutes the default for a
 * missing, malformed, or out-of-range value, so callers never re-apply
 * fallbacks.
 */
export interface NotificationConfig {
  /** Maximum number of simultaneously visible toast cards. */
  maxToastsVisible: number;
  /** Appearance and lifetime of an individual toast card. */
  toast: ToastConfig;
}

/**
 * Payload persisted as a Pi custom session entry.
 *
 * `version` is validated on read, so a payload written under a different
 * shape is rejected instead of misread. The message is stored whole; the
 * bounded height of a toast card is presentation only.
 */
export interface NotificationEntry {
  message: string;
  severity: NotificationSeverity;
  /** Capture time as epoch milliseconds. */
  timestamp: number;
  version: typeof ENTRY_VERSION;
}

/** Per-card toast settings. */
export interface ToastConfig {
  /** Maximum body rows one card may occupy. */
  maxLines: number;
  /** Card lifetime in milliseconds, measured from arrival. */
  timeout: number;
  /** Widest a card may grow, in terminal columns. */
  width: number;
}

/** Dotted path of every supported numeric setting. */
export type ConfigPath =
  "maxToastsVisible" | "toast.maxLines" | "toast.timeout" | "toast.width";

/** Notification severity, mirroring Pi's `ctx.ui.notify` type argument. */
export type NotificationSeverity = "error" | "info" | "warning";

/**
 * Inclusive bounds for every supported numeric setting.
 *
 * Keys are the dotted configuration paths, so a warning can name a field
 * exactly as the user wrote it.
 */
export const CONFIG_RANGES: {
  readonly [Path in ConfigPath]: {
    readonly max: number;
    readonly min: number;
  };
} = {
  maxToastsVisible: { max: 10, min: 1 },
  "toast.maxLines": { max: 20, min: 1 },
  "toast.timeout": { max: 60_000, min: 250 },
  "toast.width": { max: 80, min: 20 },
} as const;

/**
 * Custom session-entry type used for notification history, namespaced so
 * it cannot collide with another extension's session state.
 */
export const CUSTOM_ENTRY_TYPE = "notification-center:entry";

/** Configuration defaults, used whenever a value is unusable. */
export const DEFAULT_CONFIG = {
  maxToastsVisible: 5,
  toast: {
    maxLines: 5,
    timeout: 3000,
    width: 64,
  },
} as const satisfies NotificationConfig;

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
