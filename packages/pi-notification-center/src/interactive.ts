/**
 * Detection of Pi's interactive TUI mode.
 *
 * Owns the single predicate that decides whether this package may install
 * its notification wrapper and render overlays. It does NOT own any
 * behavior that depends on that answer.
 *
 * `ctx.hasUI` is deliberately not used: Pi reports it as `true` in RPC
 * mode as well, where dialogs work over a JSON sub-protocol but every
 * TUI-backed method is degraded or a no-op. `ctx.mode` is the run mode
 * Pi documents for guarding terminal-only UI, so it is the check used
 * here.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Minimal context surface needed to answer the mode question. */
export type InteractiveProbeContext = Pick<ExtensionContext, "mode">;

/**
 * Whether Pi is running its interactive terminal UI.
 *
 * Returns `false` for `print`, `json`, and `rpc`, none of which can host
 * a terminal overlay.
 */
export function isInteractiveTui(ctx: InteractiveProbeContext): boolean {
  return ctx.mode === "tui";
}
