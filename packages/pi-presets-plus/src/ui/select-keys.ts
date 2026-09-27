/**
 * Matches list navigation, confirm, and cancel keys against the user's Pi
 * keybindings, so remaps and Pi's Ctrl+C cancel work in every overlay.
 */
import {
  Key,
  matchesKey,
  type KeybindingsManager,
  type KeyId,
} from "@earendil-works/pi-tui";

/** A list action Pi binds under `tui.select.*`. */
export type SelectAction =
  "cancel" | "confirm" | "down" | "pageDown" | "pageUp" | "up";

/** The key each action used before it followed Pi's keybindings. */
const BUILT_IN_KEYS: Readonly<Record<SelectAction, KeyId>> = {
  cancel: Key.escape,
  confirm: Key.enter,
  down: Key.down,
  pageDown: Key.pageDown,
  pageUp: Key.pageUp,
  up: Key.up,
};

/**
 * Whether `input` triggers `action`: any key the user's Pi keybindings bind
 * to `tui.select.<action>`, or the action's built-in key, which keeps
 * working after a remap because no overlay uses it for anything else.
 */
export function matchesSelectKey(
  keybindings: Pick<KeybindingsManager, "matches">,
  input: string,
  action: SelectAction,
): boolean {
  return (
    keybindings.matches(input, `tui.select.${action}`) ||
    matchesKey(input, BUILT_IN_KEYS[action])
  );
}
