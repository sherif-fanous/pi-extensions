/**
 * Decides whether Pi is running its interactive terminal UI, which is the
 * condition for installing the notification wrapper and drawing overlays.
 */

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
