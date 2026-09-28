/**
 * Parsing for JSON documents whose top level must be an object, such as
 * extension configuration files.
 */

import { isRecord } from "../guards.js";

/**
 * Outcome of `parseJsonObject`.
 *
 * `invalid-json` carries the error `JSON.parse` threw, so callers can
 * describe it. `not-object` means the text parsed but its top level is
 * `null`, an array, or a primitive.
 */
export type ParseJsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: "invalid-json"; error: unknown }
  | { ok: false; reason: "not-object" };

/**
 * Parse `text` as JSON and check that its top level is an object.
 *
 * Never throws: a parse failure and a non-object value come back as
 * distinct results, so callers can word a warning for each.
 */
export function parseJsonObject(text: string): ParseJsonObjectResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: "invalid-json", error };
  }

  return isRecord(parsed)
    ? { ok: true, value: parsed }
    : { ok: false, reason: "not-object" };
}
