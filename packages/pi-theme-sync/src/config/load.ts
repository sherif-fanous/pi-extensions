/** Reads the User and Project `config.json` files and resolves the effective configuration. */

import type {
  ConfigSource,
  LoadedRuntimeConfig,
  RuntimeConfig,
  RuntimeConfigSources,
} from "../types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  configScopeLabel,
  isRecord,
  loadConfigFiles,
  type ConfigContext,
  type ConfigFile,
  type ConfigFileFs,
  type ConfigKeyRename,
  type ConfigScope,
} from "@sherif-fanous/pi-extensions-core";

/** The slug that names Theme Sync's configuration directory in each scope. */
export const CONFIG_EXTENSION = "theme-sync";

/** The `version` this release reads and writes. */
export const CONFIG_VERSION = 2;

/** Keys read under their old name while the new name is absent. */
export const RENAMED_CONFIG_KEYS: readonly ConfigKeyRename[] = [
  { from: "isSyncActive", to: "syncEnabled" },
];

/** Runtime values used when configuration does not provide a valid value. */
export const DEFAULT_CONFIG: RuntimeConfig = {
  syncEnabled: true,

  themes: {
    light: "light",
    dark: "dark",
  },

  detection: {
    pollIntervalMs: 2000,
  },
};

/** Inclusive ranges of the numeric settings, used by validation and the overlay. */
export const CONFIG_LIMITS = {
  "detection.pollIntervalMs": { max: 60_000, min: 1000 },
} as const;

/** Where `loadConfig` reads: tests pass their own agent directory and file system. */
export interface ConfigOptions {
  readonly agentDir?: string;
  readonly fs?: ConfigFileFs;
}

/** The part of a context `loadConfig` reads: the project, its trust, and the themes. */
export type LoadConfigContext = ConfigContext & {
  readonly ui: Pick<ExtensionContext["ui"], "getAllThemes">;
};

/** Outcome of checking one scope's value for a setting. */
type ParsedSetting<T> =
  { kind: "absent" } | { kind: "invalid" } | { kind: "valid"; value: T };

/** One setting's raw value in each scope, before validation. */
type ScopedValues = Record<ConfigScope, unknown>;

/** How to check a setting and word the warning for an invalid value. */
type SettingRules<T> = {
  defaultValue: T;
  parse: (value: unknown) => ParsedSetting<T>;
  /** First sentence of the warning; the outcome sentence is appended. */
  invalidWarning: (scope: ConfigScope, value: unknown) => string;
  /** Outcome sentence used when no scope supplies a valid value. */
  defaultOutcome: string;
};

const ABSENT = { kind: "absent" } as const;
const INVALID = { kind: "invalid" } as const;

/** Scopes in the order their values take precedence. */
const SCOPE_PRECEDENCE: readonly ConfigScope[] = ["project", "user"];

/** Checks whether a polling interval is finite and within the supported range. */
export function isValidPollIntervalMs(value: number): boolean {
  const { max, min } = CONFIG_LIMITS["detection.pollIntervalMs"];

  return Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Reads both scopes' files and resolves each setting from Project, then
 * User, then the default. `warnings` lists only invalid values; file
 * problems stay on `files`.
 */
export async function loadConfig(
  ctx: LoadConfigContext,
  options: ConfigOptions = {},
): Promise<LoadedRuntimeConfig> {
  const files = await loadConfigFiles(ctx, {
    agentDir: options.agentDir,
    extension: CONFIG_EXTENSION,
    fs: options.fs,
    renamedKeys: RENAMED_CONFIG_KEYS,
    scopes: ["user", "project"],
    version: CONFIG_VERSION,
  });
  const warnings: string[] = [];
  const availableThemes = new Set(
    ctx.ui.getAllThemes().map((theme) => theme.name),
  );
  const scopeValues = (keyPath: string): ScopedValues => ({
    project: valueAt(files.project, keyPath),
    user: valueAt(files.user, keyPath),
  });
  const { max, min } = CONFIG_LIMITS["detection.pollIntervalMs"];

  const syncEnabled = resolveSetting(
    scopeValues("syncEnabled"),
    {
      defaultValue: DEFAULT_CONFIG.syncEnabled,
      parse: (value) =>
        value === undefined
          ? ABSENT
          : typeof value === "boolean"
            ? valid(value)
            : INVALID,
      invalidWarning: (scope, value) =>
        `${configScopeLabel(scope)} setting "syncEnabled" must be a boolean, not ${JSON.stringify(value)}.`,
      defaultOutcome: `Using the default value ${String(DEFAULT_CONFIG.syncEnabled)}.`,
    },
    warnings,
  );
  const lightTheme = resolveTheme(
    scopeValues("themes.light"),
    "light",
    availableThemes,
    warnings,
  );
  const darkTheme = resolveTheme(
    scopeValues("themes.dark"),
    "dark",
    availableThemes,
    warnings,
  );
  const pollIntervalMs = resolveSetting(
    scopeValues("detection.pollIntervalMs"),
    {
      defaultValue: DEFAULT_CONFIG.detection.pollIntervalMs,
      parse: (value) =>
        value == null
          ? ABSENT
          : typeof value === "number" && isValidPollIntervalMs(value)
            ? valid(value)
            : INVALID,
      invalidWarning: (scope, value) =>
        `${configScopeLabel(scope)} setting "pollIntervalMs" must be a number between ${String(min)} and ${String(max)} milliseconds, not ${JSON.stringify(value)}.`,
      defaultOutcome: `Using the default value ${String(DEFAULT_CONFIG.detection.pollIntervalMs)}.`,
    },
    warnings,
  );

  const runtimeConfigSources: RuntimeConfigSources = {
    syncEnabled: syncEnabled.source,

    themes: {
      light: lightTheme.source,
      dark: darkTheme.source,
    },

    detection: {
      pollIntervalMs: pollIntervalMs.source,
    },
  };

  const runtimeConfig: RuntimeConfig = {
    syncEnabled: syncEnabled.value,

    themes: {
      light: lightTheme.value,
      dark: darkTheme.value,
    },

    detection: {
      pollIntervalMs: pollIntervalMs.value,
    },
  };

  return { files, runtimeConfig, runtimeConfigSources, warnings };
}

/**
 * Resolves one setting from project, then user, then the default, skipping
 * a scope whose value is invalid. Each invalid value is warned about, ending
 * with the default outcome when no scope supplies a valid value, and otherwise
 * with `Ignored it.`, since another scope's value applies.
 */
function resolveSetting<T>(
  values: ScopedValues,
  setting: SettingRules<T>,
  warnings: string[],
): { source: ConfigSource; value: T } {
  let resolved: { source: ConfigScope; value: T } | undefined;
  const invalidScopes: ConfigScope[] = [];

  for (const scope of SCOPE_PRECEDENCE) {
    const parsed = setting.parse(values[scope]);

    if (parsed.kind === "invalid") {
      invalidScopes.push(scope);
    } else if (parsed.kind === "valid") {
      resolved ??= { source: scope, value: parsed.value };
    }
  }

  const outcome = resolved ? "Ignored it." : setting.defaultOutcome;

  for (const scope of invalidScopes) {
    warnings.push(`${setting.invalidWarning(scope, values[scope])} ${outcome}`);
  }

  return resolved ?? { source: "default", value: setting.defaultValue };
}

function resolveTheme(
  values: ScopedValues,
  appearance: "light" | "dark",
  availableThemes: Set<string>,
  warnings: string[],
): { source: ConfigSource; value: string } {
  const defaultTheme = DEFAULT_CONFIG.themes[appearance];

  return resolveSetting(
    values,
    {
      defaultValue: defaultTheme,
      parse: (value) =>
        value == null || value === ""
          ? ABSENT
          : typeof value === "string" && availableThemes.has(value)
            ? valid(value)
            : INVALID,
      invalidWarning: (_scope, value) =>
        `Theme ${JSON.stringify(value)} was not found in Pi.`,
      defaultOutcome: `Using the default theme "${defaultTheme}".`,
    },
    warnings,
  );
}

function valid<T>(value: T): ParsedSetting<T> {
  return { kind: "valid", value };
}

/** The value at a dot-separated key path in a loaded file, or `undefined`. */
function valueAt(file: ConfigFile, keyPath: string): unknown {
  if (file.state !== "loaded") return undefined;

  let value: unknown = file.data;

  for (const key of keyPath.split(".")) {
    if (!isRecord(value)) return undefined;

    value = value[key];
  }

  return value;
}
