/**
 * Detector registry and dispatcher.
 *
 * Owns the `POLLING_DETECTORS` and `SUBSCRIPTION_DETECTORS` `as const`
 * arrays that act as the single source of truth for which detection
 * strategies exist, the `detectAppearance` switch that dispatches to
 * detector implementations, and the `probeAvailable*Detectors` helpers that
 * filter the registry to currently supported detectors at startup. Does NOT
 * own color-scheme, terminal, or system detection logic, or the runtime
 * detection loop (lives in `runtime.ts`).
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import type {
  Appearance,
  PollingDetector,
  SubscriptionDetector,
} from "../types.js";
import {
  detectAppearanceViaColorScheme,
  hasColorSchemeApi,
} from "./pi/color-scheme.js";
import { detectAppearanceViaSystem } from "./system/appearance.js";
import { probeDecMode2031Support } from "./terminal/dec-mode-2031.js";
import { detectAppearanceViaOsc11Background } from "./terminal/osc-11.js";

const POLLING_DETECTORS = [
  "color-scheme",
  "osc-11",
  "system",
] as const satisfies readonly PollingDetector[];
const SUBSCRIPTION_DETECTORS = [
  "color-scheme-subscription",
] as const satisfies readonly SubscriptionDetector[];

/**
 * Each arm consumes exactly one source: `color-scheme` reads Pi's API through
 * the TUI handle, `osc-11` writes a raw query through `ctx`, and `system`
 * needs neither. Both parameters are threaded through so callers do not have
 * to know which detector needs which.
 */
export async function detectAppearance(
  ctx: ExtensionContext,
  pollingDetector: PollingDetector,
  tui: TUI | undefined,
): Promise<Appearance> {
  switch (pollingDetector) {
    case "color-scheme":
      return detectAppearanceViaColorScheme(tui);

    case "osc-11":
      return detectAppearanceViaOsc11Background(ctx);

    case "system":
      return detectAppearanceViaSystem();
  }
}

export async function probeAvailablePollingDetectors(
  ctx: ExtensionContext,
  tui: TUI | undefined,
): Promise<PollingDetector[]> {
  const availablePollingDetectors: PollingDetector[] = [];

  for (const detector of POLLING_DETECTORS) {
    if ((await detectAppearance(ctx, detector, tui)) !== "unknown") {
      availablePollingDetectors.push(detector);
    }
  }

  return availablePollingDetectors;
}

export async function probeAvailableSubscriptionDetectors(
  ctx: ExtensionContext,
  tui: TUI | undefined,
): Promise<SubscriptionDetector[]> {
  const availableSubscriptionDetectors: SubscriptionDetector[] = [];

  for (const detector of SUBSCRIPTION_DETECTORS) {
    if (
      detector === "color-scheme-subscription" &&
      hasColorSchemeApi(tui) &&
      (await probeDecMode2031Support(ctx)) === "supported"
    ) {
      availableSubscriptionDetectors.push(detector);
    }
  }

  return availableSubscriptionDetectors;
}
