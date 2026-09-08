/** Registers appearance detectors, dispatches polling, and probes availability. */

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
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

const POLLING_DETECTORS = [
  "color-scheme",
  "osc-11",
  "system",
] as const satisfies readonly PollingDetector[];
const SUBSCRIPTION_DETECTORS = [
  "color-scheme-subscription",
] as const satisfies readonly SubscriptionDetector[];

type ReportDetectorFailure = (
  detector: PollingDetector | SubscriptionDetector,
) => void;

/** Runs one polling detector and reports failures as an unknown appearance. */
export async function detectAppearance(
  ctx: ExtensionContext,
  pollingDetector: PollingDetector,
  tui: TUI | undefined,
  reportFailure?: ReportDetectorFailure,
): Promise<Appearance> {
  try {
    switch (pollingDetector) {
      case "color-scheme":
        return await detectAppearanceViaColorScheme(tui);

      case "osc-11":
        return await detectAppearanceViaOsc11Background(ctx);

      case "system":
        return await detectAppearanceViaSystem();
    }
  } catch {
    reportFailure?.(pollingDetector);

    return "unknown";
  }
}

/** Returns polling detectors that can report an appearance in this session. */
export async function probeAvailablePollingDetectors(
  ctx: ExtensionContext,
  tui: TUI | undefined,
  reportFailure?: ReportDetectorFailure,
  isCancelled: () => boolean = () => false,
): Promise<PollingDetector[]> {
  const availablePollingDetectors: PollingDetector[] = [];

  for (const detector of POLLING_DETECTORS) {
    // A pending terminal probe can outlive the session that started it.
    if (isCancelled()) {
      break;
    }

    if (
      (await detectAppearance(ctx, detector, tui, reportFailure)) !== "unknown"
    ) {
      availablePollingDetectors.push(detector);
    }
  }

  return availablePollingDetectors;
}

/** Returns subscription detectors supported by Pi and the terminal. */
export async function probeAvailableSubscriptionDetectors(
  ctx: ExtensionContext,
  tui: TUI | undefined,
  reportFailure?: ReportDetectorFailure,
): Promise<SubscriptionDetector[]> {
  const availableSubscriptionDetectors: SubscriptionDetector[] = [];

  for (const detector of SUBSCRIPTION_DETECTORS) {
    try {
      if (
        detector === "color-scheme-subscription" &&
        hasColorSchemeApi(tui) &&
        (await probeDecMode2031Support(ctx)) === "supported"
      ) {
        availableSubscriptionDetectors.push(detector);
      }
    } catch {
      reportFailure?.(detector);
    }
  }

  return availableSubscriptionDetectors;
}
