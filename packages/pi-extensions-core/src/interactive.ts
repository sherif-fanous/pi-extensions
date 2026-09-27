/**
 * Decides whether Pi is running its interactive terminal UI, which is the
 * condition for terminal-only work such as overlays, transcript entries
 * meant to be read in the TUI, and terminal queries.
 */

import { notifyWarnings, type GuardContext } from "./extension.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Whether Pi is running its interactive terminal UI.
 *
 * Returns `false` for `print`, `json`, and `rpc`, none of which can host
 * a terminal overlay. `ctx.mode` is the run mode Pi documents for
 * guarding terminal-only UI; `ctx.hasUI` is also `true` under RPC, where
 * every TUI-backed method is degraded or a no-op.
 */
export function isInteractiveTui(ctx: Pick<ExtensionContext, "mode">): boolean {
  return ctx.mode === "tui";
}

/**
 * Whether a command that opens a terminal overlay may run.
 *
 * Returns `true` in the interactive terminal UI. In every other mode it
 * notifies one warning through {@link notifyWarnings},
 * `<command> needs Pi's interactive terminal UI. Run it from the TUI.`, and
 * returns `false`, so the caller returns before opening anything. Pi's
 * non-TUI `ctx.ui.custom` resolves `undefined` without showing anything.
 */
export function requireInteractiveTui(
  ctx: GuardContext & Pick<ExtensionContext, "mode">,
  extensionName: string,
  command: string,
): boolean {
  if (isInteractiveTui(ctx)) return true;

  notifyWarnings(ctx, extensionName, [
    `${command} needs Pi's interactive terminal UI. Run it from the TUI.`,
  ]);

  return false;
}
