/**
 * Development-only extension for exercising the notification center.
 *
 * Owns a `/emit` command that sends notifications through the same
 * shared `ctx.ui.notify` function real extensions use, so a manual TUI
 * check can drive every severity, a multiline message, and a burst that
 * exceeds the visible stack limit. It is NOT part of the published
 * package and is never loaded by the extension itself.
 *
 * Focus, overlay stacking, and expiry timing cannot be unit tested, so
 * this is the only check that covers them. Run it before a release, and
 * after touching the toast surface or the capture wrapper.
 *
 * ```shell
 * pi -e . -e ./examples/emitter.ts
 * ```
 *
 * Then confirm, using the subcommands below:
 *
 * - Captured notifications never appear as chat-transcript rows.
 * - Toasts do not steal keyboard input while you keep typing.
 * - A notification triggered from inside another extension's overlay
 *   leaves that overlay focused and closable with Esc. This is the
 *   regression that `tui-bridge.ts` exists to prevent, and the reason
 *   its surface is created eagerly at session start.
 * - Expiry follows `toast.timeout`, oldest first, and the stack compacts.
 * - `maxToastsVisible` and `toast.maxLines` bound what is shown, while
 *   `/notifications` still holds every complete message.
 * - History survives `/reload`.
 * - No operating-system notification appears.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function emitter(pi: ExtensionAPI): void {
  pi.registerCommand("emit", {
    description:
      "Emit sample notifications for a manual notification-center check. Accepts `burst`, `lines`, or `long`.",
    getArgumentCompletions: (prefix) =>
      [
        { label: "burst", value: "burst" },
        { label: "lines", value: "lines" },
        { label: "long", value: "long" },
      ].filter((item) => item.value.startsWith(prefix)),
    handler: (args, ctx) => {
      const mode = args.trim();

      if (mode === "burst") {
        // More than the default `maxToastsVisible` of 5, to show eviction.
        for (let index = 1; index <= 8; index += 1) {
          ctx.ui.notify(`Burst notification ${String(index)}.`, "info");
        }

        return Promise.resolve();
      }

      if (mode === "long") {
        ctx.ui.notify(
          `A single very long notification that comfortably exceeds the configured toast width: ${"detail ".repeat(
            40,
          )}end.`,
          "warning",
        );

        return Promise.resolve();
      }

      if (mode === "lines") {
        ctx.ui.notify(
          [
            "A multiline notification:",
            "- first detail line",
            "- second detail line",
            "- third detail line",
            "- fourth detail line",
            "- fifth detail line",
            "- sixth detail line",
          ].join("\n"),
          "warning",
        );

        return Promise.resolve();
      }

      ctx.ui.notify("An info notification.", "info");
      ctx.ui.notify("A warning notification.", "warning");
      ctx.ui.notify(
        "An error notification.\nWith a second line that only history keeps.",
        "error",
      );
      ctx.ui.notify("A notification sent without an explicit severity.");

      return Promise.resolve();
    },
  });
}
