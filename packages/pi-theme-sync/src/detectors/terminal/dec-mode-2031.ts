import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Appearance } from "../../types.js";
import { parseDsr997Reply } from "./dsr-996.js";
import { queryWithTerminalListener } from "./query.js";

const DEC_MODE_2031_DECRQM = "\x1b[?2031$p";
const DEC_MODE_2031_DISABLE = "\x1b[?2031l";
const DEC_MODE_2031_ENABLE = "\x1b[?2031h";

type DecMode2031Support = "supported" | "unsupported" | "unknown";

export type DecMode2031Subscription = {
  removePiTerminalInputListener: () => void;
  disableTerminalNotifications: () => void;
};

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
