/**
 * OSC 11 background-color appearance probe.
 *
 * Owns the OSC 11 query sequence and `detectAppearanceViaOsc11Background`,
 * which queries the terminal for its background color and converts the
 * hex reply to an `Appearance` via the shared `classifyHexColor`
 * luminance heuristic. Does NOT own the terminal-query primitive
 * (delegates to `./query.ts`) or the hex-to-appearance classifier (lives
 * in `../../color.ts`).
 */

import { classifyHexColor } from "../../color.js";
import type { Appearance } from "../../types.js";
import { queryWithTerminalListener } from "./query.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const osc11BackgroundQuery = "\x1b]11;?\x1b\\";

export async function detectAppearanceViaOsc11Background(
  ctx: ExtensionContext,
): Promise<Appearance> {
  return (
    (await queryWithTerminalListener(ctx, osc11BackgroundQuery, (data) => {
      // Each X11 RGB channel contains one to four hex digits, independently.
      const match = data.match(
        /\x1b\]11;rgb:((?:[0-9a-fA-F]{1,4}\/){2}[0-9a-fA-F]{1,4})(?:\x07|\x1b\\)/,
      );

      if (!match) {
        return undefined;
      }

      const rawColor = match[1];

      if (!rawColor) {
        return undefined;
      }

      const hexColor = rawColor
        .split("/")
        .map((part) =>
          Math.round((parseInt(part, 16) / (16 ** part.length - 1)) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");

      const detectedAppearance = classifyHexColor(hexColor);

      return detectedAppearance === "unknown" ? undefined : detectedAppearance;
    })) ?? "unknown"
  );
}
