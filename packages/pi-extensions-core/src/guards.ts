/**
 * Type guards for parsed JSON and thrown file-system errors.
 */

/**
 * Whether a thrown value is a file-system error meaning the file does not
 * exist.
 *
 * Checks for a `code` of `ENOENT`, so it accepts any object carrying that
 * code, not only `Error` instances.
 */
export function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

/**
 * Whether a value is an object, excluding `null` and arrays.
 *
 * Narrows to `Record<string, unknown>` so callers can read properties of
 * parsed JSON. Class instances also pass, since the check does not inspect
 * the prototype.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
