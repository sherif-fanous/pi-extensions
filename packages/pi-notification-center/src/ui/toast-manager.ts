/**
 * Lifecycle of the visible toast stack: the bounded visible list, one
 * expiration timer per toast, oldest-first eviction, and the render
 * surface the cards are drawn into.
 *
 * Every timer lives here so `dispose` can cancel all of them, and every
 * callback re-checks `disposed` before touching the TUI. A reload
 * replaces the runtime while timers are still pending, and a stale
 * runtime must not mutate the new runtime's UI.
 */

import type { NotificationConfig, NotificationEntry } from "../types.js";
import {
  canRenderToasts,
  TOAST_HORIZONTAL_MARGIN,
  ToastStackComponent,
} from "./toast-stack.js";
import {
  createToastSurface,
  type BridgeUi,
  type ToastSurface,
} from "./tui-bridge.js";

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

/**
 * Manages the passive toast surface and the cards inside it.
 *
 * The surface is created once and hidden when the stack empties. It is
 * never removed and re-pushed, because a surface that joins the overlay
 * stack late consumes the close of whatever was already open.
 */
export class ToastManager {
  private disposed = false;
  private readonly surface: ToastSurface<ToastStackComponent> | undefined;
  private readonly timers = new Map<NotificationEntry, TimerHandle>();
  private visible: NotificationEntry[] = [];

  /**
   * Create the manager and its render surface.
   *
   * The surface is created here rather than on the first toast so the
   * overlay enters the stack before any transient overlay does. It starts
   * hidden, so an idle session shows nothing.
   */
  constructor(
    ui: BridgeUi,
    private readonly config: NotificationConfig,
  ) {
    this.surface = createToastSurface(
      ui,
      (theme, terminalSize) =>
        new ToastStackComponent(theme, config, terminalSize),
      {
        anchor: "top-right",
        margin: { right: TOAST_HORIZONTAL_MARGIN, top: 1 },
        visible: canRenderToasts,
        width: config.toast.width,
      },
    );
  }

  /** Cancel every timer and permanently remove the surface. */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    for (const handle of this.timers.values()) {
      globalThis.clearTimeout(handle);
    }

    this.timers.clear();
    this.visible = [];
    this.surface?.component.setToasts([]);
    this.surface?.remove();
  }

  /**
   * Show one notification as a toast.
   *
   * Synchronous, so an emitting extension never awaits UI work and the
   * expiration timer starts on arrival. Each call must pass its own
   * entry: timers are keyed by entry, so the same object shown twice
   * strands its first timer and dismisses only one of the two cards.
   */
  show(entry: NotificationEntry): void {
    if (this.disposed) return;

    this.visible.push(entry);

    // Evict before arming the timer, so the evicted toast's own timer is
    // cancelled in the same step.
    while (this.visible.length > this.config.maxToastsVisible) {
      const [oldest] = this.visible.splice(0, 1);

      if (oldest) this.cancel(oldest);
    }

    this.timers.set(
      entry,
      globalThis.setTimeout(() => {
        this.expire(entry);
      }, this.config.toast.timeout),
    );

    this.sync();
  }

  private cancel(entry: NotificationEntry): void {
    const handle = this.timers.get(entry);

    if (handle !== undefined) {
      globalThis.clearTimeout(handle);
      this.timers.delete(entry);
    }
  }

  private expire(entry: NotificationEntry): void {
    if (this.disposed) return;

    this.timers.delete(entry);

    const index = this.visible.indexOf(entry);

    if (index >= 0) this.visible.splice(index, 1);

    this.sync();
  }

  /**
   * Push the current list to the component and match surface visibility.
   *
   * An empty stack hides the surface rather than removing it, so it keeps
   * its place at the bottom of the overlay stack for the whole session.
   */
  private sync(): void {
    if (this.disposed || !this.surface) return;

    this.surface.component.setToasts([...this.visible]);
    this.surface.setVisible(this.visible.length > 0);
    this.surface.requestRender();
  }
}
