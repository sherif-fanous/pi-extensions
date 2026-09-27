/** Acquires the current session's live TUI handle. */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

const TUI_HANDLE_WIDGET_KEY = "pi-theme-sync-tui-handle";

/** Gets the live TUI handle when Pi is running in interactive mode. */
export function getTuiHandle(
  ctx: Pick<ExtensionContext, "mode" | "ui">,
): TUI | undefined {
  if (ctx.mode !== "tui") {
    return undefined;
  }

  let tui: TUI | undefined;

  // Pi exposes the live TUI only to component factories. A temporary
  // zero-line widget captures the handle without displaying anything.
  try {
    ctx.ui.setWidget(TUI_HANDLE_WIDGET_KEY, (candidate) => {
      tui = candidate;

      return { invalidate: () => {}, render: () => [] };
    });
  } catch {
    return undefined;
  }

  try {
    ctx.ui.setWidget(TUI_HANDLE_WIDGET_KEY, undefined);
  } catch {
    // The zero-line widget is harmless if Pi rejects its removal.
  }

  return tui;
}
