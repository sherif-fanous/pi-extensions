export type Appearance = "light" | "dark" | "unknown";

export type PollingDetector = "dsr-996" | "osc-11" | "system";

export type SubscriptionDetector = "dec-mode-2031";

export type LoadedConfig = {
  themes?: {
    light?: string;
    dark?: string;
  };
  detection?: {
    pollIntervalMs?: number;
  };
};

export type RuntimeConfig = {
  themes: {
    light: string;
    dark: string;
  };
  detection: {
    pollIntervalMs: number;
  };
};
