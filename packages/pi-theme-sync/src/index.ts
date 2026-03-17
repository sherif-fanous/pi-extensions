/**
 * pi-theme-sync — Pi package extension that keeps Pi's theme aligned with the
 * terminal or system appearance.
 *
 * Detection strategy:
 * - probe all detectors for availability
 * - determine current appearance from available polling detectors in priority order
 * - if DEC mode 2031 is available, subscribe to unsolicited palette updates
 * - otherwise poll available polling detectors in priority order
 *
 * In subscription mode a lightweight drift-check poller runs alongside the
 * subscription to reassert the correct theme when the user (or another
 * extension) changes the Pi theme manually.
 */
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { DEFAULT_CONFIG, loadConfig } from "./config.js";
import {
  detectAppearanceFromAvailablePollingDetectors,
  probeAvailablePollingDetectors,
  probeAvailableSubscriptionDetectors,
} from "./detectors/index.js";
import {
  type DecMode2031Subscription,
  enableDecMode2031Subscription,
} from "./detectors/terminal/dec-mode-2031.js";
import type { Appearance, RuntimeConfig } from "./types.js";

export default function (pi: ExtensionAPI) {
  let config: RuntimeConfig = {
    themes: { ...DEFAULT_CONFIG.themes },
    detection: { ...DEFAULT_CONFIG.detection },
  };

  let currentAppearance: Appearance = "unknown";

  let poller: ReturnType<typeof setInterval> | undefined;
  let driftPoller: ReturnType<typeof setInterval> | undefined;
  let decMode2031Subscription: DecMode2031Subscription | undefined;

  const applyMappedTheme = (
    ctx: ExtensionContext,
    detectedAppearance: "light" | "dark",
  ) => {
    const desiredThemeName = config.themes[detectedAppearance];

    if (desiredThemeName === ctx.ui.theme.name) {
      return;
    }

    ctx.ui.setTheme(desiredThemeName);
  };

  const cleanup = () => {
    if (poller) {
      clearInterval(poller);
      poller = undefined;
    }

    if (driftPoller) {
      clearInterval(driftPoller);
      driftPoller = undefined;
    }

    decMode2031Subscription?.removePiTerminalInputListener();
    decMode2031Subscription?.disableTerminalNotifications();
    decMode2031Subscription = undefined;
  };

  const setupAppearanceMonitoring = async (ctx: ExtensionContext) => {
    config = await loadConfig(ctx);

    const availablePollingDetectors = await probeAvailablePollingDetectors(ctx);
    const availableSubscriptionDetectors =
      await probeAvailableSubscriptionDetectors(ctx);

    const initialAppearance =
      await detectAppearanceFromAvailablePollingDetectors(
        ctx,
        availablePollingDetectors,
      );

    if (initialAppearance !== "unknown") {
      currentAppearance = initialAppearance;
      applyMappedTheme(ctx, initialAppearance);
    }

    for (const detector of availableSubscriptionDetectors) {
      if (detector === "dec-mode-2031") {
        const subscription = enableDecMode2031Subscription(
          ctx,
          (detectedAppearance: Appearance) => {
            if (detectedAppearance !== "unknown") {
              currentAppearance = detectedAppearance;
              applyMappedTheme(ctx, detectedAppearance);
            }
          },
        );

        if (subscription) {
          decMode2031Subscription = subscription;

          // Reassert the correct theme periodically in case the user (or
          // another extension) changed it manually.  This does not query the
          // terminal — it only compares the last known appearance against Pi's
          // current theme.
          driftPoller = setInterval(() => {
            if (currentAppearance !== "unknown") {
              applyMappedTheme(ctx, currentAppearance);
            }
          }, config.detection.pollIntervalMs);

          return;
        }
      }
    }

    if (availablePollingDetectors.length > 0) {
      poller = setInterval(() => {
        void detectAppearanceFromAvailablePollingDetectors(
          ctx,
          availablePollingDetectors,
        ).then((detectedAppearance: Appearance) => {
          if (detectedAppearance !== "unknown") {
            currentAppearance = detectedAppearance;
            applyMappedTheme(ctx, detectedAppearance);
          }
        });
      }, config.detection.pollIntervalMs);
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    await setupAppearanceMonitoring(ctx);
  });

  pi.on("session_shutdown", () => {
    cleanup();
  });
}
