/** Probes terminal support for DEC private mode 2031. */

import { queryWithTerminalListener } from "./query.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const decMode2031Decrqm = "\x1b[?2031$p";

type DecMode2031Support = "supported" | "unsupported" | "unknown";

/** Reports whether the terminal recognizes color scheme notification mode. */
export async function probeDecMode2031Support(
  ctx: ExtensionContext,
): Promise<DecMode2031Support> {
  return (
    (await queryWithTerminalListener(ctx, decMode2031Decrqm, (data) => {
      const support = parseDecMode2031Decrqm(data);

      return support === "unknown" ? undefined : support;
    })) ?? "unknown"
  );
}

function parseDecMode2031Decrqm(data: string): DecMode2031Support {
  // DECRQM states 1 through 3 mean the terminal recognizes the mode.
  if (/\x1b\[\?2031;[123]\$y/.test(data)) {
    return "supported";
  }

  // States 0 and 4 mean the mode is unavailable.
  if (/\x1b\[\?2031;[04]\$y/.test(data)) {
    return "unsupported";
  }

  return "unknown";
}
