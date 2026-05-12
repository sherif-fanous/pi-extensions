/**
 * DEC private mode 2031 subscription-based appearance notifications.
 *
 * Owns the DECRQM-2031 support probe (`probeDecMode2031Support`), the
 * enable / disable lifecycle (`enableDecMode2031Subscription`), the
 * `DecMode2031Subscription` cleanup contract
 * (`removePiTerminalInputListener` + `disableTerminalNotifications`),
 * and the persistent listener that converts unsolicited terminal
 * notifications into the runtime callback. Does NOT own the
 * terminal-query primitive (delegates to `./query.ts`) or the runtime's
 * subscription-over-polling preference (lives in `runtime.ts`).
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Appearance } from "../../types.js";
import { parseDsr997Reply } from "./dsr-996.js";
import { queryWithTerminalListener } from "./query.js";

const DEC_MODE_2031_DECRQM = "\x1b[?2031$p";
const DEC_MODE_2031_DISABLE = "\x1b[?2031l";
const DEC_MODE_2031_ENABLE = "\x1b[?2031h";

export type DecMode2031Subscription = {
  removePiTerminalInputListener: () => void;
  disableTerminalNotifications: () => void;
};

type DecMode2031Support = "supported" | "unsupported" | "unknown";

export function enableDecMode2031Subscription(
  ctx: ExtensionContext,
  onAppearanceDetected: (detectedAppearance: Appearance) => void,
): DecMode2031Subscription | undefined {
  if (!ctx.hasUI) {
    return undefined;
  }

  const removePiTerminalInputListener = ctx.ui.onTerminalInput(
    (data: string) => {
      const detectedAppearance = parseDsr997Reply(data);

      if (detectedAppearance === "unknown") {
        return undefined; // Not our data — let it pass through
      }

      onAppearanceDetected(detectedAppearance);

      return { consume: true };
    },
  );

  process.stdout.write(DEC_MODE_2031_ENABLE);

  return {
    removePiTerminalInputListener,
    disableTerminalNotifications: () => {
      process.stdout.write(DEC_MODE_2031_DISABLE);
    },
  };
}

export async function probeDecMode2031Support(
  ctx: ExtensionContext,
): Promise<DecMode2031Support> {
  return (
    (await queryWithTerminalListener(ctx, DEC_MODE_2031_DECRQM, (data) => {
      const support = parseDecMode2031Decrqm(data);

      return support === "unknown" ? undefined : support;
    })) ?? "unknown"
  );
}

function parseDecMode2031Decrqm(data: string): DecMode2031Support {
  // 1=set, 2=reset (but recognized), 3=permanently set — all mean supported
  if (/\x1b\[\?2031;[123]\$y/.test(data)) {
    return "supported";
  }

  // 0=not recognized, 4=permanently reset — unsupported
  if (/\x1b\[\?2031;[04]\$y/.test(data)) {
    return "unsupported";
  }

  return "unknown";
}
