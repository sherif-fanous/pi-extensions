import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { classifyHexColor } from "../../color.js";
import type { Appearance } from "../../types.js";
import { queryWithTerminalListener } from "./query.js";

const OSC_11_BACKGROUND_QUERY = "\x1b]11;?\x1b\\";

export async function detectAppearanceViaOsc11Background(
  ctx: ExtensionContext,
): Promise<Appearance> {
  return (
    (await queryWithTerminalListener(ctx, OSC_11_BACKGROUND_QUERY, (data) => {
      const match = data.match(/\x1b\]11;rgb:([0-9a-fA-F/]+)(?:\x07|\x1b\\)/);

      if (!match) {
        return undefined;
      }

      const rawColor = match[1];

      if (!rawColor) {
        return undefined;
      }

      const colorParts = rawColor
        .split("/")
        .map((part) => part.slice(0, 2).padStart(2, "0"));

      if (colorParts.length < 3) {
        return undefined;
      }

      const detectedAppearance = classifyHexColor(
        `${colorParts[0]}${colorParts[1]}${colorParts[2]}`,
      );

      return detectedAppearance === "unknown" ? undefined : detectedAppearance;
    })) ?? "unknown"
  );
}
