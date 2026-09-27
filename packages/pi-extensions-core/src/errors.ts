/**
 * Error helpers for turning thrown values into user-facing text.
 */

/**
 * Describe a thrown value as text.
 *
 * Returns the message of an `Error`, or the value converted to a string
 * otherwise, since JavaScript lets code throw anything. The result is not
 * punctuated, so callers can embed it mid-sentence.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
