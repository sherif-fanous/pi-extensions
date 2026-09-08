/**
 * Intercepts `ctx.ui.notify`, records each notification as a session
 * entry, and hands it to the toast manager.
 *
 * Pi exposes no notification event or middleware hook, so the wrapper
 * over the shared mutable `ExtensionUIContext` is the only seam. It sees
 * a notification only when the emitter holds that same context, which
 * excludes Pi core rendering, anything emitted before this extension
 * activates, project-trust prompts, and separately created UI contexts.
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
   * Returns `undefined` in every other mode, leaving Pi's own
   * notification behavior untouched.
   */
  static install(
    ctx: CaptureContext,
    pi: CapturePi,
    config: NotificationConfig,
  ): CaptureRuntime | undefined {
    if (!isInteractiveTui(ctx)) return undefined;

    const runtime = new CaptureRuntime(ctx, pi);

    runtime.manager = new ToastManager(ctx.ui, config);
    // Stored by reference, not bound, so restoration puts back the exact
    // same function object the context had before installation.
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
   * The wrapper is removed only when the shared context still points at
   * this runtime's function, so an extension that wrapped `notify`
   * afterwards keeps its own wrapper.
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
   * Report a notification-center problem as a captured notification.
   *
   * Valid only after installation completes. The message gets one history
   * entry and one toast, and does not re-enter the wrapper.
   */
  warn(message: string): void {
    this.capture(message, "warning");
  }

  /**
   * Record one intercepted notification and show it as a toast.
   *
   * Runs to completion synchronously, awaiting nothing. The original
   * `notify` is not called, which is what keeps the message out of the
   * chat transcript.
   */
  private capture(message: string, type?: NotificationSeverity): void {
    if (this.disposed) return;

    // Pi treats a missing type as informational.
    const entry = createNotificationEntry(message, type ?? "info");

    try {
      this.pi.appendEntry(CUSTOM_ENTRY_TYPE, entry);
    } catch {
      // A session that cannot store history still shows the toast.
    }

    this.manager?.show(entry);
  }
}
