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

/**
 * Describe a thrown value as the end of a sentence, adding a full stop
 * unless the message already ends in `.`, `!`, or `?`.
 */
export function describeErrorSentence(error: unknown): string {
  let message: string;

  try {
    message = describeError(error).trim();
  } catch {
    // A thrown value whose conversion to text throws in turn.
    message = "";
  }

  if (message === "") return "Unknown error.";

  return /[!.?]$/u.test(message) ? message : `${message}.`;
}
