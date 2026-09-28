/**
 * Turns a value thrown by an editor or picker action into one
 * user-facing sentence.
 */
import { describeErrorSentence } from "@sherif-fanous/pi-extensions-core";

/**
 * Format an unexpected action failure as
 * `Could not complete the action: <message>`.
 */
export function formatActionError(error: unknown): string {
  return `Could not complete the action: ${describeErrorSentence(error)}`;
}
