/**
 * Wording helpers for user-facing text.
 */

/**
 * Write a count followed by the noun in the matching number:
 * `1 preset`, `0 presets`, `3 presets`.
 *
 * `plural` defaults to `singular` followed by `s`; pass it for irregular
 * nouns, such as `pluralize(count, "entry", "entries")`.
 */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
