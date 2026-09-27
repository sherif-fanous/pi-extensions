/**
 * Warning texts for configuration files an extension could not use, so
 * every extension words these failures the same way.
 */

import { describeErrorSentence } from "./errors.js";
import type { ParseJsonObjectResult } from "./json.js";

/**
 * Warning for a configuration file `parseJsonObject` rejected:
 * `Configuration at <path> is not valid JSON: <message>. Ignored the file.`
 * for invalid JSON, or
 * `Configuration at <path> must be a JSON object. Ignored the file.` for
 * any other top-level value.
 */
export function malformedConfigWarning(
  path: string,
  failure: Extract<ParseJsonObjectResult, { ok: false }>,
): string {
  return failure.reason === "invalid-json"
    ? `Configuration at ${path} is not valid JSON: ${describeErrorSentence(failure.error)} Ignored the file.`
    : `Configuration at ${path} must be a JSON object. Ignored the file.`;
}

/**
 * Warning for a configuration file that exists but could not be read:
 * `Could not read configuration at <path>: <message>. Ignored the file.`
 */
export function unreadableConfigWarning(path: string, error: unknown): string {
  return `Could not read configuration at ${path}: ${describeErrorSentence(error)} Ignored the file.`;
}
