/**
 * Obtains the render surface the toast stack draws into, bridging from
 * the extension context to the live TUI.
 *
 * The surface is a `nonCapturing` overlay anchored top-right, pushed on
 * the TUI that core's `getLiveTui` reaches. Two properties keep it out of
 * other extensions' way, and both are load-bearing:
 *
 * 1. Reaching the TUI never moves keyboard focus, unlike `ctx.ui.custom`,
 *    whose non-overlay branch defocuses the active component and hands
 *    focus to the core editor when it completes.
 * 2. The overlay is created once, eagerly, at session start, before any
 *    transient overlay exists. Pi's `hideOverlay()` pops the last-pushed
 *    stack entry without skipping `nonCapturing` overlays, so a surface
 *    pushed after another extension's overlay consumes that overlay's
 *    next close and leaves it visible but unclosable. Creating this one
 *    first keeps it at the bottom of the stack, where every later
 *    overlay closes above it.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type {
  Component,
  OverlayHandle,
  OverlayOptions,
} from "@earendil-works/pi-tui";
import {
  getLiveTui,
  type LiveTuiContext,
} from "@sherif-fanous/pi-extensions-core";

/** Everything the toast manager needs from a successful bridge call. */
export interface ToastSurface<TComponent extends Component = Component> {
  component: TComponent;
  /** Remove the surface permanently. Safe to call more than once. */
  remove: () => void;
  requestRender: () => void;
  /** Show or hide the surface without leaving the overlay stack. */
  setVisible: (visible: boolean) => void;
}

/**
 * Builds the surface's component once the TUI's theme and terminal are
 * reachable. Called at most once per successful bridge call.
 */
export type ToastComponentFactory<TComponent extends Component> = (
  theme: Theme,
  terminalSize: () => { height: number; width: number },
) => TComponent;

/**
 * Create the passive toast overlay.
 *
 * Call once per runtime, during session start. Returns `undefined` when
 * no TUI is reachable or overlay creation fails, which the caller treats
 * as record history and show nothing. Never changes which component holds
 * keyboard focus.
 *
 * The overlay starts hidden. The manager reveals it when the first toast
 * arrives.
 */
export function createToastSurface<TComponent extends Component>(
  ctx: LiveTuiContext,
  createComponent: ToastComponentFactory<TComponent>,
  overlayOptions: OverlayOptions,
): ToastSurface<TComponent> | undefined {
  const live = getLiveTui(ctx, TOAST_WIDGET_KEY);

  if (!live) return undefined;

  const { theme, tui } = live;

  try {
    const component = createComponent(theme, () => ({
      height: tui.terminal.rows,
      width: tui.terminal.columns,
    }));
    const handle: OverlayHandle = tui.showOverlay(component, {
      ...overlayOptions,
      // A toast must never take focus from the editor or an active
      // component.
      nonCapturing: true,
    });

    handle.setHidden(true);

    return {
      component,
      remove: () => {
        handle.hide();
      },
      requestRender: () => {
        tui.requestRender();
      },
      setVisible: (visible) => {
        handle.setHidden(!visible);
      },
    };
  } catch {
    return undefined;
  }
}

/** Namespaced so the transient widget `getLiveTui` adds cannot collide. */
const TOAST_WIDGET_KEY = "notification-center:bridge";
