/**
 * Hex-to-appearance classifier.
 *
 * Owns the single `classifyHexColor` function that turns a `"RRGGBB"`
 * string into `"light"` / `"dark"` / `"unknown"` via a relative-luminance
 * heuristic. Does NOT own the terminal query that produces hex colors
 * (lives in `detectors/terminal/osc-11.ts`).
 */

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

  const red = parseInt(hexColor.slice(0, 2), 16);
  const green = parseInt(hexColor.slice(2, 4), 16);
  const blue = parseInt(hexColor.slice(4, 6), 16);

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return "unknown";
  }

  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance >= 0.5 ? "light" : "dark";
}
