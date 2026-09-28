/**
 * Footer key hints in the family's notation (`↑/↓ Move · Enter Select ·
 * Esc Close`) and matching of Pi's `tui.select.*` keybindings.
 *
 * Hints for a keybinding show the key the user actually has bound, like
 * Pi's own hints, because a remap replaces the default keys. Keys with no
 * keybinding id, such as `F1`, are written literally with
 * {@link formatKeyId}.
 */

import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Keybinding,
  type KeybindingsManager,
  type KeyId,
} from "@earendil-works/pi-tui";

/** A list action Pi binds under `tui.select.<action>`. */
export type SelectAction =
  "cancel" | "confirm" | "down" | "pageDown" | "pageUp" | "up";

/** Separator between two hints on a footer line. */
const KEY_HINT_SEPARATOR = " · ";
/** Checked in this order, so the first action bound to a key wins. */
const SELECT_ACTIONS: readonly SelectAction[] = [
  "up",
  "down",
  "pageUp",
  "pageDown",
  "confirm",
  "cancel",
];
/** Key-id parts that are not written as their id with a capital first letter. */
const KEY_PART_LABELS: Readonly<Record<string, string>> = {
  down: "↓",
  enter: "Enter",
  esc: "Esc",
  escape: "Esc",
  left: "←",
  pagedown: "PgDn",
  pageup: "PgUp",
  return: "Enter",
  right: "→",
  up: "↑",
};

/**
 * Spell a Pi key id the way hints show it: modifiers and named keys in
 * Title Case joined with `+` (`Ctrl+S`, `Shift+Tab`, `F1`), arrows as
 * `↑ ↓ ← →`, `Esc`, `Enter`, `PgUp`, `PgDn`. A bare printable key stays
 * as typed (`n`, `/`); a letter after a modifier is upper case.
 */
export function formatKeyId(key: KeyId): string {
  const parts = key.split("+");
  const hasModifier = parts.length > 1;

  return parts
    .map((part, index) => {
      const isKey = index === parts.length - 1;
      const label = KEY_PART_LABELS[part.toLowerCase()];

      if (label !== undefined) return label;

      if (isKey && visibleWidth(part) === 1) {
        return hasModifier ? part.toUpperCase() : part;
      }

      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join("+");
}

/**
 * One hint: the first key bound to each keybinding, joined with `/`, then
 * the Title Case `action`, as in `↑/↓ Move` or `Esc Close`.
 *
 * Returns `undefined` when none of the keybindings has a key, so the
 * hint is left out rather than naming a key that does nothing.
 * {@link wrapKeyHints} skips `undefined` entries.
 */
export function keyHint(
  keybindings: Pick<KeybindingsManager, "getKeys">,
  keybinding: Keybinding | readonly Keybinding[],
  action: string,
): string | undefined {
  const ids = typeof keybinding === "string" ? [keybinding] : keybinding;
  const keys = ids
    .map((id) => keyText(keybindings, id))
    .filter((key) => key !== undefined);

  return keys.length === 0 ? undefined : `${keys.join("/")} ${action}`;
}

/**
 * The first key bound to `keybinding`, spelled by {@link formatKeyId}, or
 * `undefined` when the user bound no key to it.
 */
export function keyText(
  keybindings: Pick<KeybindingsManager, "getKeys">,
  keybinding: Keybinding,
): string | undefined {
  const [first] = keybindings.getKeys(keybinding);

  return first === undefined ? undefined : formatKeyId(first);
}

/**
 * Kitty keyboard protocol encodings of an F1 press that pi-tui's
 * `matchesKey(data, Key.f1)` does not recognize.
 *
 * pi-tui matches F-keys against the legacy table only (`\x1bOP`,
 * `\x1b[11~`, `\x1b[[A`) but enables the Kitty protocol, so a terminal
 * may answer with the SS3 final byte carrying modifier and event
 * subfields (`CSI 1 ; <mod> : <event> P`, which Ghostty sends) or with
 * the codepoint form (`CSI 57364 ; <mod> : <event> u`). Only presses are
 * listed, with the event subfield `1` or without one, so a release falls
 * through.
 */
const kittyF1Presses: ReadonlySet<string> = new Set([
  "\x1b[1P",
  "\x1b[1;1P",
  "\x1b[1;1:1P",
  "\x1b[57364u",
  "\x1b[57364;1u",
  "\x1b[57364;1:1u",
]);

/**
 * Whether `data` is an F1 press, the key a form uses for `F1 Help`,
 * including the Kitty encodings `matchesKey(data, Key.f1)` misses.
 */
export function matchesHelpKey(data: string): boolean {
  return matchesKey(data, Key.f1) || kittyF1Presses.has(data);
}

/**
 * The `tui.select.*` action `data` triggers under the user's Pi
 * keybindings, or `undefined`.
 *
 * Only the bound keys count: a remap replaces the default keys rather
 * than adding to them, as in Pi's own lists. Cancel is bound to Esc and
 * Ctrl+C by default.
 */
export function matchSelectAction(
  keybindings: Pick<KeybindingsManager, "matches">,
  data: string,
): SelectAction | undefined {
  return SELECT_ACTIONS.find((action) =>
    keybindings.matches(data, `tui.select.${action}`),
  );
}

/**
 * Lay out `hints` on as many lines of `width` columns as they need,
 * joined with ` · ` and broken only between two hints, so no hint is
 * ever cut. Only a single hint wider than a whole line is truncated with
 * `…`. `undefined` and empty hints are skipped.
 */
export function wrapKeyHints(
  hints: readonly (string | undefined)[],
  width: number,
): string[] {
  const lineWidth = Math.max(1, width);
  const lines: string[] = [];
  let current = "";

  for (const hint of hints) {
    if (hint === undefined || hint.length === 0) continue;

    const joined =
      current.length === 0 ? hint : `${current}${KEY_HINT_SEPARATOR}${hint}`;

    if (current.length > 0 && visibleWidth(joined) > lineWidth) {
      lines.push(current);
      current = hint;
    } else {
      current = joined;
    }
  }

  if (current.length > 0) lines.push(current);

  return lines.map((line) => truncateToWidth(line, lineWidth, "…"));
}
