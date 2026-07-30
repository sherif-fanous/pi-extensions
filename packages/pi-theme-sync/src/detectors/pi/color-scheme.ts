/**
 * Pi color-scheme polling and subscription detectors.
 *
 * Owns conversion of Pi's terminal color-scheme API into `Appearance` values
 * and the subscription cleanup contract. Does NOT own TUI-handle acquisition,
 * terminal support probing, or runtime strategy selection.
 */

import type { TUI } from "@earendil-works/pi-tui";
import type { Appearance } from "../../types.js";
import { DEFAULT_TERMINAL_QUERY_TIMEOUT_MS } from "../terminal/query.js";

export type ColorSchemeSubscription = {
  removeColorSchemeListener: () => void;
};

export async function detectAppearanceViaColorScheme(
  tui: TUI | undefined,
): Promise<Appearance> {
  if (!hasColorSchemeApi(tui)) {
    return "unknown";
  }

  return (
    (await tui.queryTerminalColorScheme({
      timeoutMs: DEFAULT_TERMINAL_QUERY_TIMEOUT_MS,
    })) ?? "unknown"
  );
}

export function enableColorSchemeSubscription(
  tui: TUI | undefined,
  onAppearanceDetected: (detectedAppearance: Appearance) => void,
): ColorSchemeSubscription | undefined {
  if (!hasColorSchemeApi(tui)) {
    return undefined;
  }

  const removeColorSchemeListener =
    tui.onTerminalColorSchemeChange(onAppearanceDetected);

  tui.setTerminalColorSchemeNotifications(true);

  return { removeColorSchemeListener };
}

export function hasColorSchemeApi(tui: TUI | undefined): tui is TUI {
  return (
    typeof tui?.queryTerminalColorScheme === "function" &&
    typeof tui.onTerminalColorSchemeChange === "function" &&
    typeof tui.setTerminalColorSchemeNotifications === "function"
  );
}
