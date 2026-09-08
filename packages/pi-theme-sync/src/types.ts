/** Defines configuration, detector, and runtime state shared across the extension. */

/** Appearance reported by a detector. */
export type Appearance = "light" | "dark" | "unknown";

/** Configuration file scope. */
export type ConfigScope = "project" | "global";

/** Origin of an effective configuration value. */
export type ConfigSource = ConfigScope | "default";

/** Configuration values that the overlay can save. */
export type EditableConfigChanges = Partial<{
  "themes.light": string;
  "themes.dark": string;
  "detection.pollIntervalMs": number;
  isSyncActive: boolean;
}>;

/** Supported fields in a configuration file before defaults are applied. */
export type LoadedConfig = {
  isSyncActive?: boolean;

  themes?: {
    light?: string;
    dark?: string;
  };

  detection?: {
    pollIntervalMs?: number;
  };
};

/** Effective runtime configuration, value sources, and load warnings. */
export type LoadedRuntimeConfig = {
  runtimeConfig: RuntimeConfig;
  runtimeConfigSources: RuntimeConfigSources;
  warnings: string[];
};

/** Detector strategies that read appearance on demand. */
export type PollingDetector = "color-scheme" | "osc-11" | "system";

/** Effective configuration used by the runtime. */
export type RuntimeConfig = {
  isSyncActive: boolean;

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
  isSyncActive: ConfigSource;

  themes: {
    light: ConfigSource;
    dark: ConfigSource;
  };

  detection: {
    pollIntervalMs: ConfigSource;
  };
};

/** Runtime state displayed by the status overlay. */
export type RuntimeStatus = {
  currentAppearance: Appearance;
  desiredTheme?: string;
  appliedTheme: string;

  detectionStrategy: string;
  availableDetectors: string[];
  syncStatus: "active" | "inactive";
  pollIntervalMs: number;

  configSources: RuntimeConfigSources;
  warnings: string[];

  lastUpdateAt?: number;
  lastEvent: string;
};

/** Detector strategies that receive appearance change reports. */
export type SubscriptionDetector = "color-scheme-subscription";
