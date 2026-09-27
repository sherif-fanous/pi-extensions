/**
 * Development-only extension for exercising the notification center.
 *
 * Owns a `/emit` command that sends notifications through the same
 * shared `ctx.ui.notify` function real extensions use, so a manual TUI
 * check can drive every severity, a multiline message, and a burst that
 * exceeds the visible stack limit. It is NOT part of the published
 * package and is never loaded by the extension itself.
 *
 * `burst`, `lines`, and `long` each take an optional count, so the same
 * command can produce a message that fits the detail pane and one that
 * needs scrolling without editing this file. Filler text comes from a
 * word list here rather than a package, because a dev-only example is
 * not worth a dependency.
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

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

export default function emitter(pi: ExtensionAPI): void {
  pi.registerCommand("emit", {
    description:
      "Emit sample notifications for a manual notification-center check. Accepts `burst`, `lines`, or `long`, each with an optional count.",
    getArgumentCompletions: (prefix) =>
      [
        { label: "burst [count]", value: "burst" },
        { label: "lines [count]", value: "lines" },
        { label: "long [words]", value: "long" },
      ].filter((item) => item.value.startsWith(prefix)),
    handler: (args, ctx) => {
      const [mode = "", rawCount] = args.trim().split(/\s+/u);

      if (mode === "burst") {
        const count = readCount(rawCount, DEFAULT_BURST, ctx);

        // Mixed severities, because an all-info burst hides whether each
        // card keeps its own color once the stack evicts the oldest.
        for (let index = 1; index <= count; index += 1) {
          ctx.ui.notify(
            `Burst notification ${String(index)} of ${String(count)}. ${loremText(6, index)}`,
            randomSeverity(),
          );
        }

        return Promise.resolve();
      }

      if (mode === "long") {
        const words = readCount(rawCount, DEFAULT_LONG_WORDS, ctx);

        ctx.ui.notify(
          `A single ${String(words)} word notification: ${loremText(words, 0)}`,
          "warning",
        );

        return Promise.resolve();
      }

      if (mode === "lines") {
        const count = readCount(rawCount, DEFAULT_LINES, ctx);
        const lines = Array.from({ length: count }, (_value, index) =>
          loremText(LINE_WORDS, index),
        );

        ctx.ui.notify(
          [`A notification of ${String(count)} lines:`, ...lines].join("\n"),
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

/** Cards in a burst, above the default `maxToastsVisible` of 5. */
const DEFAULT_BURST = 7;

/** Body lines in a multiline notification. */
const DEFAULT_LINES = 7;

/** Words in a long notification. */
const DEFAULT_LONG_WORDS = 100;

/** Words per body line, enough to wrap in a narrow toast. */
const LINE_WORDS = 8;

const SEVERITIES = ["error", "info", "warning"] as const;

/** Filler vocabulary, kept here so the example needs no dependency. */
const LOREM_WORDS =
  `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod
   tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam
   quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo
   consequat duis aute irure in reprehenderit voluptate velit esse cillum
   eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident
   sunt culpa qui officia deserunt mollit anim id est laborum`.split(/\s+/u);

/**
 * Build a sentence of `count` words, starting `offset` words into the
 * vocabulary so consecutive lines do not read identically.
 */
function loremText(count: number, offset: number): string {
  const words = Array.from(
    { length: Math.max(1, count) },
    (_value, index) =>
      LOREM_WORDS[(offset * LINE_WORDS + index) % LOREM_WORDS.length] ??
      "lorem",
  );
  const sentence = words.join(" ");

  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function randomSeverity(): (typeof SEVERITIES)[number] {
  return SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)] ?? "info";
}

/**
 * Read a positive whole count, falling back to `fallback`.
 *
 * A typo emits its own notification rather than throwing, which also
 * exercises the surface being tested.
 */
function readCount(
  raw: string | undefined,
  fallback: number,
  ctx: ExtensionCommandContext,
): number {
  if (raw === undefined) return fallback;

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    ctx.ui.notify(
      `Ignoring "${raw}", which is not a positive whole number. Using ${String(fallback)}.`,
      "warning",
    );

    return fallback;
  }

  return parsed;
}
