/** Reads and subscribes to terminal appearance through Pi's TUI API. */

import type { Appearance } from "../../types.js";
import { DEFAULT_TERMINAL_QUERY_TIMEOUT_MS } from "../terminal/query.js";
import type { TUI } from "@earendil-works/pi-tui";

/** Cleanup handle for a terminal color scheme subscription. */
export type ColorSchemeSubscription = {
  removeColorSchemeListener: () => void;
};

/** Queries Pi for the terminal's current color scheme. */
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

/** Enables terminal color scheme reports and subscribes to them. */
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

/** Checks whether a TUI handle provides Pi's color scheme API. */
export function hasColorSchemeApi(tui: TUI | undefined): tui is TUI {
  return (
    typeof tui?.queryTerminalColorScheme === "function" &&
    typeof tui.onTerminalColorSchemeChange === "function" &&
    typeof tui.setTerminalColorSchemeNotifications === "function"
  );
}
