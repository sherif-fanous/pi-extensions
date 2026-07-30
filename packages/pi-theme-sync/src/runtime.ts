/**
 * Long-running theme-detection runtime.
 *
 * Owns detection orchestration (subscription vs polling preference), the
 * active poller and drift-poller intervals, the cached current-appearance
 * state, and the read-only `RuntimeStatus` surface read by the Status
 * overlay. Does NOT own configuration persistence (lives in `config.ts`) or
 * any interactive UI (lives in `command.ts`).
 */

import {
  type ExtensionContext,
  VERSION,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG, loadConfig } from "./config.js";
import {
  detectAppearance,
  probeAvailablePollingDetectors,
  probeAvailableSubscriptionDetectors,
} from "./detectors/index.js";
import {
  type ColorSchemeSubscription,
  detectAppearanceViaColorScheme,
  enableColorSchemeSubscription,
  hasColorSchemeApi,
} from "./detectors/pi/color-scheme.js";
import { getTuiHandle } from "./detectors/pi/tui-handle.js";
import type {
  Appearance,
  PollingDetector,
  RuntimeConfig,
  RuntimeStatus,
  SubscriptionDetector,
} from "./types.js";

const DETECTOR_LABELS: Record<PollingDetector | SubscriptionDetector, string> =
  {
    "color-scheme": "Terminal Color Scheme",
    "color-scheme-subscription": "Terminal Color Scheme (subscription)",
    "osc-11": "OSC 11",
    system: "System Appearance",
  };

export type ThemeSyncRuntime = {
  cleanup: () => void;
  getStatus: (ctx: ExtensionContext) => RuntimeStatus;
  setupAppearanceMonitoring: (ctx: ExtensionContext) => Promise<void>;
};

export function createThemeSyncRuntime(): ThemeSyncRuntime {
  let runtimeConfig: RuntimeConfig = structuredClone(DEFAULT_CONFIG);

  let currentAppearance: Appearance = "unknown";
  let availableDetectors: string[] = [];
  let detectionStrategy = "startup";
  let lastResolvedPollingDetector: PollingDetector | undefined;

  let lastUpdateAt: number | undefined;
  let lastEvent = "Not yet updated";
  let warnings: string[] = [];

  let runtimeConfigSources = {
    isSyncActive: "default",
    themes: { light: "default", dark: "default" },
    detection: { pollIntervalMs: "default" },
  } as RuntimeStatus["configSources"];

  let poller: ReturnType<typeof setInterval> | undefined;
  let driftPoller: ReturnType<typeof setInterval> | undefined;
  let colorSchemeSubscription: ColorSchemeSubscription | undefined;
  let isShutDown = false;

  const applyMappedTheme = (
    ctx: ExtensionContext,
    detectedAppearance: "light" | "dark",
  ) => {
    if (!runtimeConfig.isSyncActive) {
      return;
    }

    const desiredThemeName = runtimeConfig.themes[detectedAppearance];

    try {
      if (desiredThemeName === ctx.ui.theme.name) {
        return;
      }

      ctx.ui.setTheme(desiredThemeName);
    } catch {
      // Stale ctx after session replacement — nothing to apply.
    }
  };

  const markEvent = (message: string) => {
    lastEvent = message;
    lastUpdateAt = Date.now();
  };

  const resolvePollingAppearance = async (
    ctx: ExtensionContext,
    tui: TUI | undefined,
    availablePollingDetectors: PollingDetector[],
  ): Promise<Appearance> => {
    for (const detector of availablePollingDetectors) {
      if (isShutDown) {
        return "unknown";
      }

      const detectedAppearance = await detectAppearance(ctx, detector, tui);

      if (detectedAppearance !== "unknown") {
        lastResolvedPollingDetector = detector;

        return detectedAppearance;
      }
    }

    lastResolvedPollingDetector = undefined;

    return "unknown";
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

    colorSchemeSubscription?.removeColorSchemeListener();
    colorSchemeSubscription = undefined;

    isShutDown = true;
  };

  const setupAppearanceMonitoring = async (ctx: ExtensionContext) => {
    cleanup();
    isShutDown = false;

    const loadedConfig = await loadConfig(ctx);

    runtimeConfig = loadedConfig.runtimeConfig;
    runtimeConfigSources = loadedConfig.runtimeConfigSources;
    warnings = [...loadedConfig.warnings];

    const tui = getTuiHandle(ctx);

    if (ctx.hasUI && !hasColorSchemeApi(tui)) {
      warnings.push(
        `Terminal color-scheme API is unavailable in Pi ${VERSION}; falling back to other detectors.`,
      );
    }

    const availablePollingDetectors = await probeAvailablePollingDetectors(
      ctx,
      tui,
    );
    const availableSubscriptionDetectors =
      await probeAvailableSubscriptionDetectors(ctx, tui);

    availableDetectors = [
      ...availableSubscriptionDetectors.map(
        (detector) => DETECTOR_LABELS[detector],
      ),
      ...availablePollingDetectors.map((detector) => DETECTOR_LABELS[detector]),
    ];

    const initialAppearance = await resolvePollingAppearance(
      ctx,
      tui,
      availablePollingDetectors,
    );

    if (initialAppearance !== "unknown") {
      currentAppearance = initialAppearance;

      markEvent(`Detected ${initialAppearance} appearance`);
      applyMappedTheme(ctx, initialAppearance);
    } else {
      currentAppearance = "unknown";

      markEvent("Appearance detection failed");
    }

    if (!runtimeConfig.isSyncActive) {
      detectionStrategy = "Inactive";

      return;
    }

    if (
      availablePollingDetectors.length === 0 &&
      availableSubscriptionDetectors.length === 0
    ) {
      warnings.push("No appearance detectors available on this terminal");
    }

    if (currentAppearance === "unknown" && runtimeConfig.isSyncActive) {
      warnings.push(
        "Sync is active but appearance is unknown — no theme applied",
      );
    }

    for (const detector of availableSubscriptionDetectors) {
      if (detector === "color-scheme-subscription") {
        const subscription = enableColorSchemeSubscription(
          tui,
          (detectedAppearance: Appearance) => {
            if (isShutDown) {
              return;
            }

            if (detectedAppearance !== "unknown") {
              currentAppearance = detectedAppearance;
              detectionStrategy = DETECTOR_LABELS[detector];

              markEvent(`Detected ${detectedAppearance} appearance`);
              applyMappedTheme(ctx, detectedAppearance);
            }
          },
        );

        if (subscription) {
          colorSchemeSubscription = subscription;
          detectionStrategy = DETECTOR_LABELS[detector];

          // Re-query rather than only re-applying. Pi shares the terminal
          // notification flag with its own automatic theme controller and can
          // disable it mid-session, which would silently stop this listener
          // with no other signal. Re-querying keeps detection self-healing.
          // The same pass corrects drift when the user changes Pi's theme
          // manually after we set it.
          driftPoller = setInterval(() => {
            void (async () => {
              if (isShutDown) {
                return;
              }

              const detectedAppearance =
                await detectAppearanceViaColorScheme(tui);

              // The await above yields, so the session may have been replaced
              // before this continuation runs.
              if (isShutDown) {
                return;
              }

              if (
                detectedAppearance !== "unknown" &&
                detectedAppearance !== currentAppearance
              ) {
                currentAppearance = detectedAppearance;

                markEvent(`Detected ${detectedAppearance} appearance`);
                applyMappedTheme(ctx, detectedAppearance);

                return;
              }

              if (currentAppearance !== "unknown") {
                const desiredThemeName =
                  runtimeConfig.themes[currentAppearance];

                if (desiredThemeName !== ctx.ui.theme.name) {
                  markEvent(
                    `Drift corrected: reapplied ${currentAppearance} theme`,
                  );
                  applyMappedTheme(ctx, currentAppearance);
                }
              }
            })();
          }, runtimeConfig.detection.pollIntervalMs);

          return;
        }
      }
    }

    if (availablePollingDetectors.length > 0) {
      detectionStrategy = lastResolvedPollingDetector
        ? DETECTOR_LABELS[lastResolvedPollingDetector]
        : "Polling";

      poller = setInterval(() => {
        void resolvePollingAppearance(ctx, tui, availablePollingDetectors).then(
          (detectedAppearance: Appearance) => {
            if (isShutDown) {
              return;
            }

            if (detectedAppearance !== "unknown") {
              currentAppearance = detectedAppearance;
              detectionStrategy = lastResolvedPollingDetector
                ? DETECTOR_LABELS[lastResolvedPollingDetector]
                : "Polling";

              markEvent(`Detected ${detectedAppearance} appearance`);
              applyMappedTheme(ctx, detectedAppearance);
            }
          },
        );
      }, runtimeConfig.detection.pollIntervalMs);

      return;
    }

    detectionStrategy = "No available detectors";
  };

  const getStatus = (ctx: ExtensionContext): RuntimeStatus => {
    const desiredTheme: string | undefined =
      currentAppearance === "unknown"
        ? undefined
        : currentAppearance === "light"
          ? runtimeConfig.themes.light
          : runtimeConfig.themes.dark;

    return {
      currentAppearance,
      desiredTheme,
      appliedTheme: ctx.ui.theme.name ?? "unknown",

      detectionStrategy,
      availableDetectors,
      syncStatus: runtimeConfig.isSyncActive ? "active" : "inactive",
      pollIntervalMs: runtimeConfig.detection.pollIntervalMs,

      configSources: runtimeConfigSources,
      warnings,
      lastUpdateAt,
      lastEvent,
    };
  };

  return {
    cleanup,
    getStatus,
    setupAppearanceMonitoring,
  };
}
