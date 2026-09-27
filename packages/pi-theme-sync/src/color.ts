/** Classifies RGB background colors as light or dark. */

import type { Appearance } from "./types.js";

/** Classifies a six-digit RGB hex color using Rec. 709 luminance. */
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
