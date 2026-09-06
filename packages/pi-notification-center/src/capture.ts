/**
 * Notification interception and per-session runtime lifecycle.
 *
 * Owns the wrapper installed over the shared extension `ctx.ui.notify`
 * function, the persistence of each captured notification as a session
 * entry, the hand-off to the toast manager, and identity-safe teardown.
 * It does NOT own configuration loading, rendering, or the history
 * command.
 *
 * Interception is best-effort by design. Pi exposes no notification event
 * or middleware hook, so the only available seam is the shared mutable
 * `ExtensionUIContext`. Consequently this wrapper cannot see Pi core
 * status, warning, or error rendering, notifications emitted before this
 * extension activates, project-trust prompts, or notifications sent
 * through a separately created UI context. Custom transcript messages
 * sent with `pi.sendMessage` are also out of scope: they are conversation
 * entries with their own renderer, not notifications. The README states
 * the same boundary for users.
 */

import { createNotificationEntry } from "./history.js";
import { isInteractiveTui } from "./interactive.js";
import {
  CUSTOM_ENTRY_TYPE,
  type NotificationConfig,
  type NotificationSeverity,
} from "./types.js";
import { ToastManager } from "./ui/toast-manager.js";
import type { BridgeUi } from "./ui/tui-bridge.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Minimal context surface the runtime mutates and reads. */
export type CaptureContext = Pick<ExtensionContext, "mode"> & {
  ui: BridgeUi & { notify: NotifyFn };
};

/** Minimal extension API surface used for persistence. */
export type CapturePi = Pick<ExtensionAPI, "appendEntry">;

/** Notification function signature shared by Pi's UI contexts. */
export type NotifyFn = (message: string, type?: NotificationSeverity) => void;

/**
 * One activation's worth of interception state.
 *
 * A runtime is created per `session_start` and disposed on
 * `session_shutdown`. Everything it mutates is reverted by `dispose`.
 */
export class CaptureRuntime {
  private disposed = false;
  private installed: NotifyFn | undefined;
  private manager: ToastManager | undefined;
  private original: NotifyFn | undefined;

  private constructor(
    private readonly ctx: CaptureContext,
    private readonly pi: CapturePi,
  ) {}

  /**
   * Install interception when Pi is running its interactive TUI.
   *
   * Returns `undefined` in every other mode, which leaves Pi's existing
   * notification behavior — transcript rows, RPC requests, printed output
   * — completely untouched.
   */
  static install(
    ctx: CaptureContext,
    pi: CapturePi,
    config: NotificationConfig,
  ): CaptureRuntime | undefined {
    if (!isInteractiveTui(ctx)) return undefined;

    const runtime = new CaptureRuntime(ctx, pi);

    runtime.manager = new ToastManager(ctx.ui, config);
    // Stored by reference, not bound: restoration must put back the
    // exact same function object the context had before installation.
    runtime.original = ctx.ui.notify;

    runtime.installed = (message, type) => {
      runtime.capture(message, type);
    };

    ctx.ui.notify = runtime.installed;

    return runtime;
  }

  /**
   * Revert interception and release every resource.
   *
   * The wrapper is only removed when the shared context still points at
   * *this* runtime's function. Another extension may have replaced
   * `notify` afterwards, and clobbering its wrapper during our shutdown
   * would silently break it.
   */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    if (this.original && this.ctx.ui.notify === this.installed) {
      this.ctx.ui.notify = this.original;
    }

    this.manager?.dispose();
    this.manager = undefined;
  }

  /**
   * Report a notification-center problem through the normal capture path.
   *
   * Called only after installation completes, so the message takes the
   * same route as any other captured notification: exactly one history
   * entry and one toast, with no recursion back into the wrapper.
   */
  warn(message: string): void {
    this.capture(message, "warning");
  }

  /**
   * Handle one intercepted notification.
   *
   * Synchronous from the emitting extension's point of view: the entry is
   * appended and the toast enqueued without awaiting anything. The
   * original `notify` is deliberately not called, which is what keeps the
   * message out of the chat transcript.
   */
  private capture(message: string, type?: NotificationSeverity): void {
    if (this.disposed) return;

    // Pi treats a missing type as informational, and so do we.
    const entry = createNotificationEntry(message, type ?? "info");

    try {
      this.pi.appendEntry(CUSTOM_ENTRY_TYPE, entry);
    } catch {
      // Persistence failure must not swallow the notification: the user
      // still gets the toast, and an ephemeral session simply has no
      // history to rebuild.
    }

    this.manager?.show(entry);
  }
}
