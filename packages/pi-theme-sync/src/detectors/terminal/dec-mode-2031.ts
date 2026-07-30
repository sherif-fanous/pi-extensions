/**
 * DEC private mode 2031 support probe.
 *
 * Owns the DECRQM query and parser used to determine whether a terminal
 * recognizes mode 2031. Does NOT own notification lifecycle, color-scheme
 * parsing, or runtime strategy selection.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { queryWithTerminalListener } from "./query.js";

const DEC_MODE_2031_DECRQM = "\x1b[?2031$p";

type DecMode2031Support = "supported" | "unsupported" | "unknown";

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
