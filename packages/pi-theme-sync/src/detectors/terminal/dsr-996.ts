import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Appearance } from "../../types.js";
import { queryWithTerminalListener } from "./query.js";

const DSR_996_QUERY = "\x1b[?996n";

export async function detectAppearanceViaDsr996(
  ctx: ExtensionContext,
): Promise<Appearance> {
  return (
    (await queryWithTerminalListener(ctx, DSR_996_QUERY, (data) => {
      const parsedAppearance = parseDsr997Reply(data);

      return parsedAppearance === "unknown" ? undefined : parsedAppearance;
    })) ?? "unknown"
  );
}

export function parseDsr997Reply(data: string): Appearance {
  if (/\x1b\[\?997;1n/.test(data)) {
    return "dark";
  }

  if (/\x1b\[\?997;2n/.test(data)) {
    return "light";
  }

  return "unknown";
}
