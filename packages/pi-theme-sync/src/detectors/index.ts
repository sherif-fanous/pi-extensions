/** Lists the appearance detectors and probes, polls, and subscribes to them for a session. */

import type { Appearance } from "../types.js";
import {
  detectAppearanceViaColorScheme,
  enableColorSchemeSubscription,
  hasColorSchemeApi,
} from "./pi/color-scheme.js";
import { detectAppearanceViaSystem } from "./system/appearance.js";
import { probeDecMode2031Support } from "./terminal/dec-mode-2031.js";
import { detectAppearanceViaOsc11Background } from "./terminal/osc-11.js";
import {
  VERSION,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { getLiveTui } from "@sherif-fanous/pi-extensions-core";

const TUI_WIDGET_KEY = "theme-sync:tui-handle";

/** A running subscription and what the runtime shows about it. */
export type ActiveSubscription = {
  readonly label: string;
  readonly stoppedWarning: string;
  readonly unsubscribe: () => void;
};

/** What a detector reads: Pi's session context and its live TUI handle. */
export type DetectorContext = {
  readonly ctx: ExtensionContext;
  readonly tui: TUI | undefined;
};

/** How probing and polling report back to the session that started them. */
export type DetectorHooks = {
  /** Whether the session ended, so a pending probe or poll stops early. */
  readonly isCancelled: () => boolean;
  /** Record a warning for the session. */
  readonly warn: (warning: string) => void;
};

/** The polling and subscription detectors, each list in priority order. */
export type DetectorSet = {
  readonly polling: readonly PollingDetector[];
  readonly subscription: readonly SubscriptionDetector[];
};

/** The appearance a poll found, with the label of the detector that answered. */
export type PolledAppearance = {
  readonly appearance: Appearance;
  readonly detector?: string;
};

/** A detector that reads the appearance on demand. */
export type PollingDetector = {
  /** Name the status report and warnings show. */
  readonly label: string;
  /** Read the appearance, or `unknown` when this detector has no answer. */
  readonly detect: (context: DetectorContext) => Promise<Appearance>;
  /** A warning to show before probing when Pi lacks what this detector needs. */
  readonly unavailableWarning?: (
    context: DetectorContext,
  ) => string | undefined;
};

/** The detectors that work in one session, as {@link probeDetectors} found them. */
export type SessionDetectors = {
  /** Labels of the available polling detectors, in priority order. */
  readonly pollingLabels: readonly string[];
  /** Labels of the available subscription detectors, in priority order. */
  readonly subscriptionLabels: readonly string[];
  /** Ask the available polling detectors in priority order for the appearance. */
  readonly poll: () => Promise<PolledAppearance>;
  /** Subscribe through the first available subscription detector that starts. */
  readonly subscribe: (
    onAppearance: (appearance: Appearance, detector: string) => void,
  ) => ActiveSubscription | undefined;
};

/** A detector that receives appearance reports as they happen. */
export type SubscriptionDetector = {
  /** Name the status report and warnings show. */
  readonly label: string;
  /** Whether Pi and the terminal support this subscription. */
  readonly isSupported: (context: DetectorContext) => Promise<boolean>;
  /** Start listening, returning the function that stops, or `undefined` when it cannot start. */
  readonly subscribe: (
    context: DetectorContext,
    onAppearance: (appearance: Appearance) => void,
  ) => (() => void) | undefined;
  /** The warning shown when polling sees a change this subscription never reports. */
  readonly stoppedWarning: string;
};

/** Theme Sync's detectors. */
export const THEME_SYNC_DETECTORS: DetectorSet = {
  polling: [
    {
      label: "Terminal Color Scheme",
      detect: ({ tui }) => detectAppearanceViaColorScheme(tui),
      unavailableWarning: ({ ctx, tui }) =>
        ctx.hasUI && !hasColorSchemeApi(tui)
          ? `Terminal color-scheme API is unavailable in Pi ${VERSION}. Using other detectors.`
          : undefined,
    },
    {
      label: "OSC 11",
      detect: ({ ctx }) => detectAppearanceViaOsc11Background(ctx),
    },
    {
      label: "System Appearance",
      detect: () => detectAppearanceViaSystem(),
    },
  ],
  subscription: [
    {
      label: "Terminal Color Scheme (subscription)",
      isSupported: async ({ ctx, tui }) =>
        hasColorSchemeApi(tui) &&
        (await probeDecMode2031Support(ctx)) === "supported",
      subscribe: ({ tui }, onAppearance) =>
        enableColorSchemeSubscription(tui, onAppearance)
          ?.removeColorSchemeListener,
      // Silence does not reveal whether the terminal or Pi stopped reports.
      stoppedWarning:
        "Terminal color-scheme notifications stopped arriving. Switched to polling.",
    },
  ],
};

/**
 * Find the detectors that work in this session.
 *
 * A polling detector is available when it answers a concrete appearance. A
 * detector that throws adds one warning and counts as having no answer.
 * Acquires the TUI handle once, for this session only.
 */
export async function probeDetectors(
  ctx: ExtensionContext,
  detectors: DetectorSet,
  hooks: DetectorHooks,
): Promise<SessionDetectors> {
  const context: DetectorContext = {
    ctx,
    tui: getLiveTui(ctx, TUI_WIDGET_KEY)?.tui,
  };
  const reportFailure = (label: string) =>
    hooks.warn(`${label} query failed. Using the other available detectors.`);
  const detect = async (detector: PollingDetector): Promise<Appearance> => {
    try {
      return await detector.detect(context);
    } catch {
      reportFailure(detector.label);

      return "unknown";
    }
  };

  for (const detector of detectors.polling) {
    const warning = detector.unavailableWarning?.(context);

    if (warning) {
      hooks.warn(warning);
    }
  }

  const polling: PollingDetector[] = [];

  for (const detector of detectors.polling) {
    // A pending terminal probe can outlive the session that started it.
    if (hooks.isCancelled()) {
      break;
    }

    if ((await detect(detector)) !== "unknown") {
      polling.push(detector);
    }
  }

  const subscription: SubscriptionDetector[] = [];

  for (const detector of detectors.subscription) {
    if (hooks.isCancelled()) {
      break;
    }

    try {
      if (await detector.isSupported(context)) {
        subscription.push(detector);
      }
    } catch {
      reportFailure(detector.label);
    }
  }

  return {
    pollingLabels: polling.map((detector) => detector.label),
    subscriptionLabels: subscription.map((detector) => detector.label),
    poll: async () => {
      for (const detector of polling) {
        if (hooks.isCancelled()) {
          break;
        }

        const appearance = await detect(detector);

        if (appearance !== "unknown") {
          return { appearance, detector: detector.label };
        }
      }

      return { appearance: "unknown" };
    },
    subscribe: (onAppearance) => {
      for (const detector of subscription) {
        const unsubscribe = detector.subscribe(context, (appearance) =>
          onAppearance(appearance, detector.label),
        );

        if (unsubscribe) {
          return {
            label: detector.label,
            stoppedWarning: detector.stoppedWarning,
            unsubscribe,
          };
        }
      }

      return undefined;
    },
  };
}
