/** Defines configuration, detector, and runtime state shared across the extension. */

import type {
  ConfigOutcome,
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
 * Effective runtime configuration, value sources, and what reading the
 * files found, with a value warning per invalid value.
 */
export type LoadedRuntimeConfig = {
  outcome: ConfigOutcome<ConfigScope>;
  runtimeConfig: RuntimeConfig;
  runtimeConfigSources: RuntimeConfigSources;
};

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

  /** The `Config:` block as the session start read it; empty before then. */
  configStatusLines: readonly string[];
  warnings: string[];

  lastUpdateAt?: number;
  lastEvent: string;
};
