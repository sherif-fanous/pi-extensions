/**
 * Accessor for Pi's live TUI instance.
 *
 * Owns the isolated widget-factory round-trip used to acquire the current
 * session's TUI. Does NOT own color-scheme detection or retain the handle
 * across calls.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

const TUI_HANDLE_WIDGET_KEY = "pi-theme-sync-tui-handle";

export function getTuiHandle(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
): TUI | undefined {
  if (!ctx.hasUI) {
    return undefined;
  }

  let tui: TUI | undefined;

  // Pi exposes the live TUI only to component factories, so a zero-line
  // widget is registered and removed synchronously to capture it.
  try {
    ctx.ui.setWidget(TUI_HANDLE_WIDGET_KEY, (candidate) => {
      tui = candidate;

      return { invalidate: () => {}, render: () => [] };
    });
  } catch {
    return undefined;
  }

  // Registration succeeded, so the placeholder must be removed or it stays in
  // Pi's widget map for the rest of the session. It renders no lines, so a
  // failed removal is invisible rather than harmful, and the captured handle
  // is valid either way — discarding it would lose detection and still leak.
  try {
    ctx.ui.setWidget(TUI_HANDLE_WIDGET_KEY, undefined);
  } catch {
    // Nothing further to try; keep the handle rather than discard it.
  }

  return tui;
}
