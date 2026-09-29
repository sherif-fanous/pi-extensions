/**
 * Reaches Pi's live TUI and theme, which Pi hands only to component
 * factories, through a widget that exists for one synchronous call.
 */

import { isInteractiveTui } from "../commands/interactive.js";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

/** Pi's live TUI and the theme it renders with. */
export interface LiveTui {
  readonly theme: Theme;
  readonly tui: TUI;
}

/**
 * The context `getLiveTui` reads: the run mode and the factory form of
 * `ctx.ui.setWidget`, the only form that receives the TUI.
 */
export type LiveTuiContext = Pick<ExtensionContext, "mode"> & {
  readonly ui: {
    setWidget(
      key: string,
      content:
        | ((tui: TUI, theme: Theme) => Component & { dispose?(): void })
        | undefined,
    ): void;
  };
};

/**
 * Get Pi's live TUI and theme in the interactive terminal UI, or
 * `undefined` in any other mode or when Pi does not hand them over.
 *
 * Adds a zero-line widget under `key` and removes it before returning, so
 * nothing is drawn. Relies on Pi calling a widget factory synchronously
 * inside `setWidget`; a factory Pi calls later yields `undefined`. Never
 * moves keyboard focus, unlike `ctx.ui.custom`.
 */
export function getLiveTui(
  ctx: LiveTuiContext,
  key: string,
): LiveTui | undefined {
  if (!isInteractiveTui(ctx)) return undefined;

  let live: LiveTui | undefined;

  try {
    ctx.ui.setWidget(key, (tui, theme) => {
      live = { theme, tui };

      return EMPTY_WIDGET;
    });
  } catch {
    return undefined;
  } finally {
    try {
      ctx.ui.setWidget(key, undefined);
    } catch {
      // A zero-line widget Pi will not remove draws nothing.
    }
  }

  return live;
}

const EMPTY_WIDGET: Component = {
  invalidate: () => undefined,
  render: () => [],
};
