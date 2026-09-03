/**
 * Lifecycle owner for the visible toast stack.
 *
 * Owns the bounded visible list, one independent expiration timer per
 * toast, oldest-first eviction, stack compaction, render requests, and
 * the single render surface. It does NOT own rendering (see
 * `toast-stack.ts`), history persistence, or notification interception.
 *
 * All timers live here so `dispose` can cancel every one of them, and
 * every callback re-checks `disposed` before touching the TUI: a reload
 * replaces the runtime while timers are still pending, and a stale
 * runtime must never mutate the new runtime's UI.
 */

import type { NotificationConfig, NotificationEntry } from "../types.js";
import { canRenderToasts, ToastStackComponent } from "./toast-stack.js";
import {
  createToastSurface,
  type BridgeUi,
  type ToastSurface,
} from "./tui-bridge.js";

/** Injectable timer functions so tests can drive expiry deterministically. */
export interface ToastTimers {
  clearTimeout: (handle: ReturnType<ToastTimers["setTimeout"]>) => void;
  setTimeout: (
    callback: () => void,
    ms: number,
  ) => ReturnType<typeof globalThis.setTimeout>;
}

type TimerHandle = ReturnType<ToastTimers["setTimeout"]>;

/**
 * Manages the passive toast surface and the cards currently inside it.
 *
 * The surface is created lazily on the first toast and removed when the
 * stack empties, so an idle session carries no surface at all.
 */
export class ToastManager {
  private disposed = false;
  private readonly surface: ToastSurface<ToastStackComponent> | undefined;
  private readonly timers = new Map<NotificationEntry, TimerHandle>();
  private visible: NotificationEntry[] = [];

  /**
   * Create the manager and, with it, its render surface.
   *
   * The surface is created here rather than on the first toast because
   * the overlay must enter the stack before any transient overlay does.
   * See `tui-bridge.ts` for why that ordering is load-bearing. It starts
   * hidden, so an idle session shows nothing.
   */
  constructor(
    ui: BridgeUi,
    private readonly config: NotificationConfig,
    private readonly clock: ToastTimers = DEFAULT_TIMERS,
  ) {
    this.surface = createToastSurface(
      ui,
      (theme, terminalSize) =>
        new ToastStackComponent(theme, config, terminalSize),
      {
        anchor: "top-right",
        margin: { right: 1, top: 1 },
        visible: (termWidth, termHeight) =>
          canRenderToasts(termWidth, termHeight, config),
        width: config.toast.width,
      },
    );
  }

  /** Cancel every timer and permanently remove the surface. */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    for (const handle of this.timers.values()) {
      this.clock.clearTimeout(handle);
    }

    this.timers.clear();
    this.visible = [];
    this.surface?.component.setToasts([]);
    this.surface?.remove();
  }

  /**
   * Show one notification as a toast.
   *
   * Fully synchronous, so an emitting extension never awaits UI work and
   * the expiration timer starts at the moment of arrival.
   */
  show(entry: NotificationEntry): void {
    if (this.disposed) return;

    this.visible.push(entry);

    // Eviction happens before the timer is armed so the evicted toast's
    // own timer is cancelled in the same step.
    while (this.visible.length > this.config.maxToastsVisible) {
      const [oldest] = this.visible.splice(0, 1);

      if (oldest) this.cancel(oldest);
    }

    this.timers.set(
      entry,
      this.clock.setTimeout(() => {
        this.expire(entry);
      }, this.config.toast.timeout),
    );

    this.sync();
  }

  private cancel(entry: NotificationEntry): void {
    const handle = this.timers.get(entry);

    if (handle !== undefined) {
      this.clock.clearTimeout(handle);
      this.timers.delete(entry);
    }
  }

  private expire(entry: NotificationEntry): void {
    if (this.disposed) return;

    this.timers.delete(entry);

    const index = this.visible.indexOf(entry);

    // Removing by identity compacts the stack: the remaining cards move
    // up on the next render without any per-card bookkeeping.
    if (index >= 0) this.visible.splice(index, 1);

    this.sync();
  }

  /**
   * Push the current list to the component and match surface visibility.
   *
   * The surface is hidden rather than removed when the stack empties, so
   * it keeps its place at the bottom of the overlay stack for the rest of
   * the session.
   */
  private sync(): void {
    if (this.disposed || !this.surface) return;

    this.surface.component.setToasts([...this.visible]);
    this.surface.setVisible(this.visible.length > 0);
    this.surface.requestRender();
  }
}

const DEFAULT_TIMERS: ToastTimers = {
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle);
  },
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
};
