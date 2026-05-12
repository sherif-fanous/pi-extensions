/**
 * Shared cross-module type definitions.
 *
 * Owns the canonical `Appearance`, `ConfigScope`, `ConfigSource`,
 * `PollingDetector`, `SubscriptionDetector`, `RuntimeConfig`,
 * `RuntimeStatus`, `LoadedConfig`, and related types consumed across the
 * runtime, configuration, command, and detector layers. Does NOT contain
 * any runtime code, validation logic, or implementation.
 */

export type Appearance = "light" | "dark" | "unknown";

export type ConfigScope = "project" | "global";

export type ConfigSource = ConfigScope | "default";

export type EditableConfigKey =
  | "themes.light"
  | "themes.dark"
  | "detection.pollIntervalMs"
  | "isSyncActive";

export type EditableConfigValue = string | number | boolean;

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

export type LoadedRuntimeConfig = {
  loadedConfig: {
    global?: LoadedConfig;
    project?: LoadedConfig;
  };
  runtimeConfig: RuntimeConfig;
  runtimeConfigSources: RuntimeConfigSources;
  warnings: string[];
};

export type PollingDetector = "dsr-996" | "osc-11" | "system";

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

export type SubscriptionDetector = "dec-mode-2031";
