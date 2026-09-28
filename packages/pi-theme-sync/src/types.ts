/** Defines configuration, detector, and runtime state shared across the extension. */

import type {
  ConfigFile,
  ConfigScope,
} from "@sherif-fanous/pi-extensions-core";

/** Appearance reported by a detector. */
export type Appearance = "light" | "dark" | "unknown";

/** Origin of an effective configuration value. */
export type ConfigSource = ConfigScope | "default";

/** Configuration values that the overlay can save. */
export type EditableConfigChanges = Partial<{
  "themes.light": string;
  "themes.dark": string;
  "detection.pollIntervalMs": number;
  syncEnabled: boolean;
}>;

/**
 * Effective runtime configuration, value sources, each scope's file, and
 * the warnings for invalid values.
 */
export type LoadedRuntimeConfig = {
  files: Record<ConfigScope, ConfigFile>;
  runtimeConfig: RuntimeConfig;
  runtimeConfigSources: RuntimeConfigSources;
  warnings: string[];
};

/** Detector strategies that read appearance on demand. */
export type PollingDetector = "color-scheme" | "osc-11" | "system";

/** Effective configuration used by the runtime. */
export type RuntimeConfig = {
  syncEnabled: boolean;

  themes: {
    light: string;
    dark: string;
  };

  detection: {
    pollIntervalMs: number;
  };
};

/** Source of each effective runtime configuration value. */
export type RuntimeConfigSources = {
  syncEnabled: ConfigSource;

  themes: {
    light: ConfigSource;
    dark: ConfigSource;
  };

  detection: {
    pollIntervalMs: ConfigSource;
  };
};

/** Runtime state displayed by the status report. */
export type RuntimeStatus = {
  currentAppearance: Appearance;
  desiredTheme?: string;
  appliedTheme: string;

  detectionStrategy: string;
  availableDetectors: string[];
  syncEnabled: boolean;
  pollIntervalMs: number;

  /** Each scope's file as the session start read it; empty before then. */
  configFiles: readonly ConfigFile[];
  warnings: string[];

  lastUpdateAt?: number;
  lastEvent: string;
};

/** Detector strategies that receive appearance change reports. */
export type SubscriptionDetector = "color-scheme-subscription";
