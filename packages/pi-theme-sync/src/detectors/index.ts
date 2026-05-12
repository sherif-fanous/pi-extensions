/**
 * Detector registry and dispatcher.
 *
 * Owns the `POLLING_DETECTORS` and `SUBSCRIPTION_DETECTORS` `as const`
 * arrays that act as the single source of truth for which detection
 * strategies exist, the `detectAppearance` switch that dispatches to
 * per-protocol detectors, and the `probeAvailable*Detectors` helpers that
 * filter the registry to currently-supported detectors at startup. Does
 * NOT own per-protocol detection logic (delegates to `./system/` and
 * `./terminal/`) or the runtime detection loop (lives in `runtime.ts`).
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  Appearance,
  PollingDetector,
  SubscriptionDetector,
} from "../types.js";
import { detectAppearanceViaSystem } from "./system/appearance.js";
import { probeDecMode2031Support } from "./terminal/dec-mode-2031.js";
import { detectAppearanceViaDsr996 } from "./terminal/dsr-996.js";
import { detectAppearanceViaOsc11Background } from "./terminal/osc-11.js";

const POLLING_DETECTORS: PollingDetector[] = ["dsr-996", "osc-11", "system"];
const SUBSCRIPTION_DETECTORS: SubscriptionDetector[] = ["dec-mode-2031"];

export async function detectAppearance(
  ctx: ExtensionContext,
  pollingDetector: PollingDetector,
): Promise<Appearance> {
  switch (pollingDetector) {
    case "dsr-996":
      return detectAppearanceViaDsr996(ctx);

    case "osc-11":
      return detectAppearanceViaOsc11Background(ctx);

    case "system":
      return detectAppearanceViaSystem();
  }
}

export async function probeAvailablePollingDetectors(
  ctx: ExtensionContext,
): Promise<PollingDetector[]> {
  const availablePollingDetectors: PollingDetector[] = [];

  for (const detector of POLLING_DETECTORS) {
    if ((await detectAppearance(ctx, detector)) !== "unknown") {
      availablePollingDetectors.push(detector);
    }
  }

  return availablePollingDetectors;
}

export async function probeAvailableSubscriptionDetectors(
  ctx: ExtensionContext,
): Promise<SubscriptionDetector[]> {
  const availableSubscriptionDetectors: SubscriptionDetector[] = [];

  for (const detector of SUBSCRIPTION_DETECTORS) {
    if (detector === "dec-mode-2031") {
      if ((await probeDecMode2031Support(ctx)) === "supported") {
        availableSubscriptionDetectors.push(detector);
      }
    }
  }

  return availableSubscriptionDetectors;
}
