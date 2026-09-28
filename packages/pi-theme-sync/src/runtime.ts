/** Detects appearance changes, applies mapped themes, and reports runtime status. */

import { DEFAULT_CONFIG } from "./config/load.js";
import { loadStartupConfig } from "./config/migrate.js";
import {
  detectAppearance,
  probeAvailablePollingDetectors,
  probeAvailableSubscriptionDetectors,
} from "./detectors/index.js";
import {
  enableColorSchemeSubscription,
  hasColorSchemeApi,
  type ColorSchemeSubscription,
} from "./detectors/pi/color-scheme.js";
import { getTuiHandle } from "./detectors/pi/tui-handle.js";
import type {
  Appearance,
  PollingDetector,
  RuntimeConfig,
  RuntimeStatus,
  SubscriptionDetector,
} from "./types.js";
import {
  VERSION,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import type {
  ConfigOutcome,
  ConfigScope,
} from "@sherif-fanous/pi-extensions-core";

type ScheduleRecurringCycle = (
  cycle: () => void,
  intervalMs: number,
) => () => void;

const DETECTOR_LABELS: Record<PollingDetector | SubscriptionDetector, string> =
  {
    "color-scheme": "Terminal Color Scheme",
    "color-scheme-subscription": "Terminal Color Scheme (subscription)",
    "osc-11": "OSC 11",
    system: "System Appearance",
  };
const RECURRING_CYCLE_FAILURE_WARNING =
  "A recurring appearance update failed. Retrying on the next cycle.";
const scheduleRecurringCycle: ScheduleRecurringCycle = (cycle, intervalMs) => {
  const timer = setInterval(cycle, intervalMs);

  return () => clearInterval(timer);
};

/** Controls appearance monitoring and exposes its current status. */
export type ThemeSyncRuntime = {
  dispose: () => void;
  getStatus: (ctx: ExtensionContext) => RuntimeStatus;
  startSession: (
    ctx: ExtensionContext,
    schedule?: ScheduleRecurringCycle,
  ) => Promise<void>;
};

/** Create an isolated theme sync runtime for one extension instance. */
export function createThemeSyncRuntime(): ThemeSyncRuntime {
  let runtimeConfig: RuntimeConfig = structuredClone(DEFAULT_CONFIG);

  let currentAppearance: Appearance = "unknown";
  let availableDetectors: string[] = [];
  let detectionStrategy = "startup";
  let lastResolvedPollingDetector: PollingDetector | undefined;

  let lastUpdateAt: number | undefined;
  let lastEvent = "Not yet updated";
  // Runtime warnings, after the configuration's own in the status report.
  let warnings: string[] = [];
  let configOutcome: ConfigOutcome<ConfigScope> | undefined;

  let stopRecurringCycle: (() => void) | undefined;
  let isRecurringCycleRunning = false;
  let colorSchemeSubscription: ColorSchemeSubscription | undefined;
  let isColorSchemeSubscriptionDemoted = false;
  let hasUnreportedAppearanceChange = false;
  let isShutDown = false;
  // Counts disposals, so a start can tell that a later dispose overtook it
  // even after a newer start cleared `isShutDown` again.
  let disposeCount = 0;

  const applyMappedTheme = (
    ctx: ExtensionContext,
    detectedAppearance: "light" | "dark",
  ) => {
    if (!runtimeConfig.syncEnabled) {
      return;
    }

    const desiredThemeName = runtimeConfig.themes[detectedAppearance];

    try {
      if (desiredThemeName === ctx.ui.theme.name) {
        return;
      }

      ctx.ui.setTheme(desiredThemeName);
    } catch {
      // The session context can expire while an appearance check is running.
    }
  };

  const markEvent = (message: string) => {
    lastEvent = message;
    lastUpdateAt = Date.now();
  };

  const pollingStrategyLabel = (): string =>
    lastResolvedPollingDetector
      ? DETECTOR_LABELS[lastResolvedPollingDetector]
      : "Polling";

  const reportDetectorFailure = (
    detector: PollingDetector | SubscriptionDetector,
  ) => {
    const warning = `${DETECTOR_LABELS[detector]} query failed. Using the other available detectors.`;

    if (!isShutDown && !warnings.includes(warning)) {
      warnings.push(warning);
    }
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

      const detectedAppearance = await detectAppearance(
        ctx,
        detector,
        tui,
        reportDetectorFailure,
      );

      if (detectedAppearance !== "unknown") {
        lastResolvedPollingDetector = detector;

        return detectedAppearance;
      }
    }

    lastResolvedPollingDetector = undefined;

    return "unknown";
  };

  const runRecurringCycle = (cycle: () => Promise<void>) => {
    if (isShutDown || isRecurringCycleRunning) {
      return;
    }

    isRecurringCycleRunning = true;

    void cycle()
      .catch(() => {
        if (
          !isShutDown &&
          !warnings.includes(RECURRING_CYCLE_FAILURE_WARNING)
        ) {
          warnings.push(RECURRING_CYCLE_FAILURE_WARNING);
        }
      })
      .finally(() => {
        isRecurringCycleRunning = false;
      });
  };

  const startRecurringCycle = (
    cycle: () => Promise<void>,
    intervalMs: number,
    schedule: ScheduleRecurringCycle,
  ) => {
    stopRecurringCycle = schedule(() => runRecurringCycle(cycle), intervalMs);
  };

  const dispose = () => {
    stopRecurringCycle?.();
    stopRecurringCycle = undefined;

    colorSchemeSubscription?.removeColorSchemeListener();
    colorSchemeSubscription = undefined;

    isColorSchemeSubscriptionDemoted = false;
    hasUnreportedAppearanceChange = false;
    isRecurringCycleRunning = false;
    isShutDown = true;
    disposeCount += 1;
  };

  const startAppearanceMonitoring = async (
    ctx: ExtensionContext,
    schedule: ScheduleRecurringCycle,
  ) => {
    const startup = await loadStartupConfig(ctx);

    if (isShutDown) {
      return;
    }

    runtimeConfig = startup.runtimeConfig;
    configOutcome = startup.outcome;
    warnings = [];

    const tui = getTuiHandle(ctx);

    if (ctx.hasUI && !hasColorSchemeApi(tui)) {
      warnings.push(
        `Terminal color-scheme API is unavailable in Pi ${VERSION}. Using other detectors.`,
      );
    }

    const availablePollingDetectors = await probeAvailablePollingDetectors(
      ctx,
      tui,
      reportDetectorFailure,
      () => isShutDown,
    );

    if (isShutDown) {
      return;
    }

    const availableSubscriptionDetectors =
      await probeAvailableSubscriptionDetectors(
        ctx,
        tui,
        reportDetectorFailure,
      );

    if (isShutDown) {
      return;
    }

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

    if (isShutDown) {
      return;
    }

    if (initialAppearance !== "unknown") {
      currentAppearance = initialAppearance;

      markEvent(`Detected ${initialAppearance} appearance`);
      applyMappedTheme(ctx, initialAppearance);
    } else {
      currentAppearance = "unknown";

      markEvent("Appearance detection failed");
    }

    if (!runtimeConfig.syncEnabled) {
      detectionStrategy = "Inactive";

      return;
    }

    if (
      availablePollingDetectors.length === 0 &&
      availableSubscriptionDetectors.length === 0
    ) {
      warnings.push("No appearance detectors are available on this terminal.");
    }

    if (currentAppearance === "unknown" && runtimeConfig.syncEnabled) {
      warnings.push(
        "Sync is on but the appearance is unknown. Did not apply a theme.",
      );
    }

    // Demotion lasts until `/reload` probes subscription support again.
    const demoteColorSchemeSubscription = () => {
      isColorSchemeSubscriptionDemoted = true;
      hasUnreportedAppearanceChange = false;

      colorSchemeSubscription?.removeColorSchemeListener();
      colorSchemeSubscription = undefined;

      availableDetectors = availablePollingDetectors.map(
        (pollingDetector) => DETECTOR_LABELS[pollingDetector],
      );
      detectionStrategy = pollingStrategyLabel();

      // Silence does not reveal whether the terminal or Pi stopped reports.
      warnings.push(
        "Terminal color-scheme notifications stopped arriving. Switched to polling.",
      );

      markEvent("Switched to polling after notifications stopped arriving");
    };

    for (const detector of availableSubscriptionDetectors) {
      if (detector === "color-scheme-subscription") {
        const subscription = enableColorSchemeSubscription(
          tui,
          (detectedAppearance: Appearance) => {
            if (isShutDown || isColorSchemeSubscriptionDemoted) {
              return;
            }

            if (detectedAppearance !== "unknown") {
              // Any report proves the channel is alive, even when its value
              // differs from the latest polling result.
              hasUnreportedAppearanceChange = false;

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

          // Polling catches missed reports and restores the configured theme
          // after a manual Pi theme change.
          startRecurringCycle(
            async () => {
              // Wait one full cycle before treating a polled change as an
              // unreported change. A notification may arrive during the poll.
              if (
                hasUnreportedAppearanceChange &&
                !isColorSchemeSubscriptionDemoted
              ) {
                demoteColorSchemeSubscription();
              }

              const detectedAppearance = await resolvePollingAppearance(
                ctx,
                tui,
                availablePollingDetectors,
              );

              // The session may close while the polling request is pending.
              if (isShutDown) {
                return;
              }

              if (
                detectedAppearance !== "unknown" &&
                detectedAppearance !== currentAppearance
              ) {
                if (isColorSchemeSubscriptionDemoted) {
                  detectionStrategy = pollingStrategyLabel();
                } else {
                  hasUnreportedAppearanceChange = true;
                }

                currentAppearance = detectedAppearance;

                markEvent(`Detected ${detectedAppearance} appearance`);
                applyMappedTheme(ctx, detectedAppearance);

                return;
              }

              if (isColorSchemeSubscriptionDemoted) {
                detectionStrategy = pollingStrategyLabel();
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
            },
            runtimeConfig.detection.pollIntervalMs,
            schedule,
          );

          return;
        }
      }
    }

    if (availablePollingDetectors.length > 0) {
      detectionStrategy = pollingStrategyLabel();

      startRecurringCycle(
        async () => {
          const detectedAppearance = await resolvePollingAppearance(
            ctx,
            tui,
            availablePollingDetectors,
          );

          if (isShutDown) {
            return;
          }

          if (detectedAppearance !== "unknown") {
            currentAppearance = detectedAppearance;
            detectionStrategy = pollingStrategyLabel();

            markEvent(`Detected ${detectedAppearance} appearance`);
            applyMappedTheme(ctx, detectedAppearance);
          }
        },
        runtimeConfig.detection.pollIntervalMs,
        schedule,
      );

      return;
    }

    detectionStrategy = "No available detectors";
  };

  // The migration message and startup warnings are notified once, after
  // probing. Warnings the recurring cycle adds later appear only in the
  // status report.
  const startSession = async (
    ctx: ExtensionContext,
    schedule: ScheduleRecurringCycle = scheduleRecurringCycle,
  ) => {
    dispose();
    isShutDown = false;

    const startDisposeCount = disposeCount;

    await startAppearanceMonitoring(ctx, schedule);

    // Any dispose since, from shutdown or a newer start, means this
    // session is gone and its messages are no longer current.
    if (disposeCount === startDisposeCount) {
      configOutcome?.notify(ctx, warnings);
    }
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
      syncEnabled: runtimeConfig.syncEnabled,
      pollIntervalMs: runtimeConfig.detection.pollIntervalMs,

      configStatusLines: configOutcome?.statusLines ?? [],
      warnings: [...(configOutcome?.statusWarnings ?? []), ...warnings],
      lastUpdateAt,
      lastEvent,
    };
  };

  return {
    dispose,
    getStatus,
    startSession,
  };
}
