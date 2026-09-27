/**
 * Obtains the render surface the toast stack draws into, bridging from
 * the extension UI context to the live TUI.
 *
 * The surface is a `nonCapturing` overlay anchored top-right, created
 * through the factory form of `ctx.ui.setWidget` purely to reach the TUI
 * instance. Two properties keep it out of other extensions' way, and
 * both are load-bearing:
 *
 * 1. `setWidget` never moves keyboard focus, unlike `ctx.ui.custom`,
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
  TUI,
} from "@earendil-works/pi-tui";

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
 * UI surface required to open the bridge.
 *
 * Only the factory form of `setWidget` is declared, because the string
 * form cannot deliver the TUI instance.
 */
export type BridgeUi = {
  setWidget(
    key: string,
    content:
      | ((tui: TUI, theme: Theme) => Component & { dispose?(): void })
      | undefined,
    options?: { placement?: "aboveEditor" | "belowEditor" },
  ): void;
};

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
  ui: BridgeUi,
  createComponent: ToastComponentFactory<TComponent>,
  overlayOptions: OverlayOptions,
): ToastSurface<TComponent> | undefined {
  let surface: ToastSurface<TComponent> | undefined;

  try {
    ui.setWidget(TOAST_WIDGET_KEY, (tui, theme) => {
      // A host that invokes the factory more than once would otherwise
      // get a second overlay, doubling every toast.
      if (!surface) {
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

        surface = {
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
      }

      return EMPTY_WIDGET;
    });
  } catch {
    return undefined;
  } finally {
    // The widget exists only to hand over the TUI instance. Removing it
    // leaves the overlay alone, since the overlay has its own handle.
    try {
      ui.setWidget(TOAST_WIDGET_KEY, undefined);
    } catch {
      // A host that cannot clear the widget still gave back a usable
      // surface, and a zero-height widget draws nothing.
    }
  }

  return surface;
}

/** Namespaced so the transient bridge widget cannot collide. */
const TOAST_WIDGET_KEY = "notification-center:bridge";

/**
 * Zero-height widget returned by the bridge factory.
 *
 * `setWidget` requires a component, but this one exists only to obtain
 * the TUI instance and is removed immediately, so it renders nothing.
 */
const EMPTY_WIDGET: Component = {
  invalidate: () => {
    // Nothing is cached.
  },
  render: () => [],
};
