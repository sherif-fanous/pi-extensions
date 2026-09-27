/**
 * Builds the keybindings manager Pi hands to `ctx.ui.custom`, so overlay
 * tests send real terminal sequences and can remap keys the way a user's
 * `keybindings.json` does.
 */
import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  type KeybindingsConfig,
} from "@earendil-works/pi-tui";

/** Pi's default TUI keybindings with `userBindings` applied on top. */
export function piKeybindings(
  userBindings: KeybindingsConfig = {},
): KeybindingsManager {
  return new KeybindingsManager(TUI_KEYBINDINGS, userBindings);
}
