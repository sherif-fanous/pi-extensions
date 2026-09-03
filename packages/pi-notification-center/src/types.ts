/**
 * Shared type definitions and documented constants for pi-notification-center.
 *
 * Owns the notification severity set, the versioned session-entry payload
 * shape, the toast configuration shape, and the single source of truth for
 * configuration defaults and valid ranges. It does NOT own configuration
 * loading, session access, rendering, or interception — those live in
 * their dedicated modules.
 */

/**
 * Resolved notification-center configuration.
 *
 * Every field is always present: the loader substitutes the documented
 * default for a missing, malformed, or out-of-range value, so downstream
 * code never has to re-apply fallbacks.
 */
export interface NotificationConfig {
  /** Maximum number of simultaneously visible toast cards. */
  maxToastsVisible: number;
  /** Appearance and lifetime of an individual toast card. */
  toast: ToastConfig;
}

/**
 * Durable payload persisted as a Pi custom session entry.
 *
 * `version` is written by this package and validated on read so a future
 * payload change can be rejected instead of misinterpreted. The message is
 * stored complete and unmodified; the bounded card height used when
 * displaying a toast is a presentation concern only.
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
  /** Card width in terminal columns. */
  width: number;
}

/** Dotted path of every supported numeric setting. */
export type ConfigPath =
  "maxToastsVisible" | "toast.maxLines" | "toast.timeout" | "toast.width";

/** Notification severity, mirroring Pi's `ctx.ui.notify` type argument. */
export type NotificationSeverity = "error" | "info" | "warning";

/**
 * Inclusive validation bounds for every supported numeric setting.
 *
 * Keys are the dotted configuration paths so a warning can name the field
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
 * Custom session-entry type used for notification history.
 *
 * Namespaced so entries written by this package cannot collide with
 * another extension's session state.
 */
export const CUSTOM_ENTRY_TYPE = "notification-center:entry";

/** Documented configuration defaults, used whenever a value is unusable. */
export const DEFAULT_CONFIG: NotificationConfig = {
  maxToastsVisible: 5,
  toast: {
    maxLines: 5,
    timeout: 3000,
    width: 50,
  },
} as const;

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
