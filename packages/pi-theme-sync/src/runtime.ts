/** Detects appearance changes, applies mapped themes, and reports runtime status. */

import { DEFAULT_CONFIG } from "./config/load.js";
import { loadStartupConfig } from "./config/migrate.js";
import {
  probeDetectors,
  THEME_SYNC_DETECTORS,
  type ActiveSubscription,
  type DetectorSet,
  type PolledAppearance,
} from "./detectors/index.js";
import type { Appearance, RuntimeConfig, RuntimeStatus } from "./types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  ConfigOutcome,
  ConfigScope,
} from "@sherif-fanous/pi-extensions-core";

/** Run `cycle` every `intervalMs`, returning the function that stops it. */
export type ScheduleRecurringCycle = (
  cycle: () => void,
  intervalMs: number,
) => () => void;

/** The runtime's seams, each defaulting to the real one. */
export type ThemeSyncRuntimeOptions = {
  /** The detectors each session probes. */
  readonly detectors?: DetectorSet;
  /** How the recurring appearance cycle is timed. */
  readonly schedule?: ScheduleRecurringCycle;
  /** Pi's effective `theme` setting, or `undefined` when it can't be read. */
  readonly readThemeSetting?: () => string | undefined;
};

/**
 * An appearance report: the startup poll, a subscription report, the start
 * of a recurring cycle, or that cycle's poll.
 */
type AppearanceReport =
  | { readonly source: "startup"; readonly polled: PolledAppearance }
  | {
      readonly source: "listener";
      readonly appearance: Appearance;
      readonly detector: string;
    }
  | { readonly source: "cycle-start" }
  | { readonly source: "poll"; readonly polled: PolledAppearance };

/**
 * How the recurring cycle treats a poll: `polling` without a subscription,
 * `subscription` while one runs, `grace` while it has until the next cycle
 * to report a change polling saw, and `demoted` after it missed one.
 */
type DetectionMode = "polling" | "subscription" | "grace" | "demoted";

const RECURRING_CYCLE_FAILURE_WARNING =
  "A recurring appearance update failed. Retrying on the next cycle.";

/** Whether Pi reads `value` as a light/dark pair: one `/`, both sides named. */
function isThemePair(value: string | undefined): value is string {
  const parts = value?.split("/");

  return parts?.length === 2 && parts.every((part) => part.trim() !== "");
}

const deprecationNotice = (light: string, dark: string): string =>
  `Theme Sync is deprecated because Pi now switches themes itself. Set "theme": "${light}/${dark}" in Pi's settings.json, then run pi remove npm:@sherif-fanous/pi-theme-sync.`;
const deferralNotice = (themeSetting: string): string =>
  `Theme Sync is deprecated and is not changing themes because Pi's theme setting "${themeSetting}" already follows the terminal. Run pi remove npm:@sherif-fanous/pi-theme-sync to uninstall it.`;
const scheduleRecurringCycle: ScheduleRecurringCycle = (cycle, intervalMs) => {
  const timer = setInterval(cycle, intervalMs);

  return () => clearInterval(timer);
};

/** Controls appearance monitoring and exposes its current status. */
export type ThemeSyncRuntime = {
  dispose: () => void;
  getStatus: (ctx: ExtensionContext) => RuntimeStatus;
  startSession: (ctx: ExtensionContext) => Promise<void>;
};

/** Create an isolated theme sync runtime for one extension instance. */
export function createThemeSyncRuntime({
  detectors = THEME_SYNC_DETECTORS,
  schedule = scheduleRecurringCycle,
  readThemeSetting = () => undefined,
}: ThemeSyncRuntimeOptions = {}): ThemeSyncRuntime {
  let runtimeConfig: RuntimeConfig = structuredClone(DEFAULT_CONFIG);

  let currentAppearance: Appearance = "unknown";
  let availableDetectors: readonly string[] = [];
  let detectionStrategy = "startup";
  let lastPolledDetector: string | undefined;

  let lastUpdateAt: number | undefined;
  let lastEvent = "Not yet updated";
  // Runtime warnings, after the configuration's own in the status report.
  let warnings: string[] = [];
  let configOutcome: ConfigOutcome<ConfigScope> | undefined;

  let stopRecurringCycle: (() => void) | undefined;
  let isRecurringCycleRunning = false;
  let subscription: ActiveSubscription | undefined;
  let detectionMode: DetectionMode = "polling";
  let isShutDown = false;
  // Set while Pi's own theme pair handles switching for this session.
  let isDeferred = false;
  // Counts disposals, so a start can tell that a later dispose overtook it
  // even after a newer start cleared `isShutDown` again.
  let disposeCount = 0;

  const applyMappedTheme = (
    ctx: ExtensionContext,
    detectedAppearance: "light" | "dark",
  ) => {
    if (isDeferred || !runtimeConfig.syncEnabled) {
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

  const addWarning = (warning: string) => {
    if (!isShutDown && !warnings.includes(warning)) {
      warnings.push(warning);
    }
  };

  const runRecurringCycle = (cycle: () => Promise<void>) => {
    if (isShutDown || isRecurringCycleRunning) {
      return;
    }

    isRecurringCycleRunning = true;

    void cycle()
      .catch(() => addWarning(RECURRING_CYCLE_FAILURE_WARNING))
      .finally(() => {
        isRecurringCycleRunning = false;
      });
  };

  const dispose = () => {
    stopRecurringCycle?.();
    stopRecurringCycle = undefined;

    subscription?.unsubscribe();
    subscription = undefined;

    detectionMode = "polling";
    isRecurringCycleRunning = false;
    isShutDown = true;
    disposeCount += 1;
  };

  const startAppearanceMonitoring = async (ctx: ExtensionContext) => {
    const startup = await loadStartupConfig(ctx);

    if (isShutDown) {
      return;
    }

    runtimeConfig = startup.runtimeConfig;
    configOutcome = startup.outcome;
    warnings = [];

    const themeSetting = readThemeSetting();

    isDeferred = isThemePair(themeSetting);

    if (isDeferred) {
      availableDetectors = [];
      currentAppearance = "unknown";
      detectionStrategy = "Inactive";

      warnings.push(deferralNotice(themeSetting as string));
      markEvent("Deferred to Pi's theme setting");

      return;
    }

    warnings.push(
      deprecationNotice(runtimeConfig.themes.light, runtimeConfig.themes.dark),
    );

    const session = await probeDetectors(ctx, detectors, {
      isCancelled: () => isShutDown,
      warn: addWarning,
    });

    if (isShutDown) {
      return;
    }

    availableDetectors = [
      ...session.subscriptionLabels,
      ...session.pollingLabels,
    ];

    const pollingStrategyLabel = (): string => lastPolledDetector ?? "Polling";

    const showAppearance = (appearance: "light" | "dark") => {
      currentAppearance = appearance;

      markEvent(`Detected ${appearance} appearance`);
      applyMappedTheme(ctx, appearance);
    };

    // Demotion lasts until `/reload` probes subscription support again.
    const demoteSubscription = (demoted: ActiveSubscription) => {
      detectionMode = "demoted";

      demoted.unsubscribe();
      subscription = undefined;

      availableDetectors = session.pollingLabels;
      detectionStrategy = pollingStrategyLabel();

      warnings.push(demoted.stoppedWarning);

      markEvent("Switched to polling after notifications stopped arriving");
    };

    // Decide what one appearance report means: a new appearance, a drifted
    // theme to reapply, a grace cycle for the subscription, or its demotion.
    const handleAppearanceReport = (report: AppearanceReport) => {
      switch (report.source) {
        case "startup": {
          const { appearance, detector } = report.polled;

          lastPolledDetector = detector;

          if (appearance === "unknown") {
            currentAppearance = "unknown";

            markEvent("Appearance detection failed");
          } else {
            showAppearance(appearance);
          }

          return;
        }

        case "listener": {
          if (
            isShutDown ||
            detectionMode === "demoted" ||
            report.appearance === "unknown"
          ) {
            return;
          }

          // Any report proves the channel is alive, even when its value
          // differs from the latest polling result.
          if (detectionMode === "grace") {
            detectionMode = "subscription";
          }

          detectionStrategy = report.detector;
          showAppearance(report.appearance);

          return;
        }

        case "cycle-start":
          // A grace cycle that passed without a report ends the subscription.
          if (detectionMode === "grace" && subscription) {
            demoteSubscription(subscription);
          }

          return;

        case "poll": {
          const { appearance, detector } = report.polled;

          lastPolledDetector = detector;

          if (detectionMode === "polling" || detectionMode === "demoted") {
            detectionStrategy = pollingStrategyLabel();
          }

          if (appearance !== "unknown" && appearance !== currentAppearance) {
            // The subscription has until the next cycle to report this
            // change, since a report may arrive while the poll runs.
            if (detectionMode === "subscription") {
              detectionMode = "grace";
            }

            showAppearance(appearance);

            return;
          }

          if (
            currentAppearance !== "unknown" &&
            runtimeConfig.themes[currentAppearance] !== ctx.ui.theme.name
          ) {
            markEvent(`Drift corrected: reapplied ${currentAppearance} theme`);
            applyMappedTheme(ctx, currentAppearance);
          }

          return;
        }
      }
    };

    const initial = await session.poll();

    if (isShutDown) {
      return;
    }

    handleAppearanceReport({ source: "startup", polled: initial });

    if (!runtimeConfig.syncEnabled) {
      detectionStrategy = "Inactive";

      return;
    }

    if (
      session.pollingLabels.length === 0 &&
      session.subscriptionLabels.length === 0
    ) {
      warnings.push("No appearance detectors are available on this terminal.");
    }

    if (currentAppearance === "unknown") {
      warnings.push(
        "Sync is on but the appearance is unknown. Did not apply a theme.",
      );
    }

    subscription = session.subscribe((appearance, detector) =>
      handleAppearanceReport({ source: "listener", appearance, detector }),
    );

    if (subscription) {
      detectionMode = "subscription";
      detectionStrategy = subscription.label;
    } else if (session.pollingLabels.length > 0) {
      detectionStrategy = pollingStrategyLabel();
    } else {
      detectionStrategy = "No available detectors";

      return;
    }

    // With a subscription, polling catches missed reports and restores the
    // configured theme after a manual Pi theme change.
    stopRecurringCycle = schedule(
      () =>
        runRecurringCycle(async () => {
          handleAppearanceReport({ source: "cycle-start" });

          const polled = await session.poll();

          // The session may close while the poll is pending.
          if (isShutDown) {
            return;
          }

          handleAppearanceReport({ source: "poll", polled });
        }),
      runtimeConfig.detection.pollIntervalMs,
    );
  };

  // The migration message and startup warnings are notified once, after
  // probing. Warnings the recurring cycle adds later appear only in the
  // status report.
  const startSession = async (ctx: ExtensionContext) => {
    dispose();
    isShutDown = false;

    const startDisposeCount = disposeCount;

    await startAppearanceMonitoring(ctx);

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
      availableDetectors: [...availableDetectors],
      syncEnabled: isDeferred ? false : runtimeConfig.syncEnabled,
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
