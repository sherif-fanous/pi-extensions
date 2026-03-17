import type { Appearance } from "./types.js";

/**
 * Classify a background color as light or dark using a relative luminance
 * heuristic based on Rec. 709 / sRGB luma coefficients:
 *   Y' = 0.2126R + 0.7152G + 0.0722B
 */
export function classifyHexColor(hexColor: string): Appearance {
  if (hexColor.length !== 6) {
    return "unknown";
  }

  const r = parseInt(hexColor.slice(0, 2), 16);
  const g = parseInt(hexColor.slice(2, 4), 16);
  const b = parseInt(hexColor.slice(4, 6), 16);

  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return "unknown";
  }

  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  return luminance >= 0.5 ? "light" : "dark";
}
