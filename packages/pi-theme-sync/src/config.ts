/** Loads, validates, and saves global and project configuration. */

import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ConfigScope,
  ConfigSource,
  EditableConfigChanges,
  LoadedConfig,
  LoadedRuntimeConfig,
  RuntimeConfig,
  RuntimeConfigSources,
} from "./types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  extensionConfigPath,
  isNotFoundError,
  malformedConfigWarning,
  parseJsonObject,
  projectConfigPath,
  unreadableConfigWarning,
  writeJsonFile,
} from "@sherif-fanous/pi-extensions-core";

/** Paths used for the current global and project configuration files. */
export const CONFIG_PATHS = {
  global: extensionConfigPath({
    extension: "theme-sync",
    file: "settings.json",
  }),
  project: (cwd: string) =>
    projectConfigPath({ cwd, extension: "theme-sync", file: "settings.json" }),
};

/** Runtime values used when configuration does not provide a valid value. */
export const DEFAULT_CONFIG: RuntimeConfig = {
  isSyncActive: true,

  themes: {
    light: "light",
    dark: "dark",
  },

  detection: {
    pollIntervalMs: 2000,
  },
};

/** Longest supported appearance polling interval. */
export const POLL_INTERVAL_MAX_MS = 60_000;
/** Shortest supported appearance polling interval. */
export const POLL_INTERVAL_MIN_MS = 1000;

/** Outcome of checking one scope's value for a setting. */
type ParsedSetting<T> =
  { kind: "absent" } | { kind: "invalid" } | { kind: "valid"; value: T };

type ReadJsonResult = {
  missing?: true;
  config?: LoadedConfig;
  warning?: string;
};

type SaveResult = { ok: true } | { ok: false; reason: string };

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
const SCOPE_PRECEDENCE: readonly ConfigScope[] = ["project", "global"];

/** Resolves the configuration file that a scope currently uses. */
export async function getConfigPath(
  scope: ConfigScope,
  cwd: string,
): Promise<string> {
  return (await readScopedConfig(scope, cwd)).filePath;
}

/** Checks whether a polling interval is finite and within the supported range. */
export function isValidPollIntervalMs(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= POLL_INTERVAL_MIN_MS &&
    value <= POLL_INTERVAL_MAX_MS
  );
}

/** Loads and validates the effective configuration for a session. */
export async function loadConfig(
  ctx: ExtensionContext,
): Promise<LoadedRuntimeConfig> {
  const warnings: string[] = [];

  const globalResult = await readScopedConfig("global", ctx.cwd);
  const projectResult = await readScopedConfig("project", ctx.cwd);

  if (globalResult.warning) {
    warnings.push(globalResult.warning);
  }

  if (projectResult.warning) {
    warnings.push(projectResult.warning);
  }

  const globalLoadedConfig = globalResult.config;
  const projectLoadedConfig = projectResult.config;

  const availableThemes = new Set(
    ctx.ui.getAllThemes().map((theme) => theme.name),
  );

  const scopeValues = (
    read: (config: LoadedConfig | undefined) => unknown,
  ): ScopedValues => ({
    project: read(projectLoadedConfig),
    global: read(globalLoadedConfig),
  });

  const isSyncActive = resolveSetting(
    scopeValues((config) => config?.isSyncActive),
    {
      defaultValue: DEFAULT_CONFIG.isSyncActive,
      parse: (value) =>
        value === undefined
          ? ABSENT
          : typeof value === "boolean"
            ? valid(value)
            : INVALID,
      invalidWarning: (scope, value) =>
        `${scopeLabel(scope)} setting "isSyncActive" must be a boolean, not ${JSON.stringify(value)}.`,
      defaultOutcome: `Using the default value ${String(DEFAULT_CONFIG.isSyncActive)}.`,
    },
    warnings,
  );
  const lightTheme = resolveTheme(
    scopeValues((config) => config?.themes?.light),
    "light",
    availableThemes,
    warnings,
  );
  const darkTheme = resolveTheme(
    scopeValues((config) => config?.themes?.dark),
    "dark",
    availableThemes,
    warnings,
  );
  const pollIntervalMs = resolveSetting(
    scopeValues((config) => config?.detection?.pollIntervalMs),
    {
      defaultValue: DEFAULT_CONFIG.detection.pollIntervalMs,
      parse: (value) =>
        value == null
          ? ABSENT
          : typeof value === "number" && isValidPollIntervalMs(value)
            ? valid(value)
            : INVALID,
      invalidWarning: (scope, value) =>
        `${scopeLabel(scope)} setting "pollIntervalMs" must be a number between ${POLL_INTERVAL_MIN_MS} and ${POLL_INTERVAL_MAX_MS} milliseconds, not ${JSON.stringify(value)}.`,
      defaultOutcome: `Using the default value ${DEFAULT_CONFIG.detection.pollIntervalMs}.`,
    },
    warnings,
  );

  const runtimeConfigSources: RuntimeConfigSources = {
    isSyncActive: isSyncActive.source,

    themes: {
      light: lightTheme.source,
      dark: darkTheme.source,
    },

    detection: {
      pollIntervalMs: pollIntervalMs.source,
    },
  };

  const runtimeConfig: RuntimeConfig = {
    isSyncActive: isSyncActive.value,

    themes: {
      light: lightTheme.value,
      dark: darkTheme.value,
    },

    detection: {
      pollIntervalMs: pollIntervalMs.value,
    },
  };

  return {
    runtimeConfig,
    runtimeConfigSources,
    warnings,
  };
}

/** Merges editable values into one configuration file. */
export async function writeConfigChanges(
  scope: ConfigScope,
  cwd: string,
  changes: EditableConfigChanges,
): Promise<SaveResult> {
  if (Object.keys(changes).length === 0) {
    return { ok: true };
  }

  const result = await readScopedConfig(scope, cwd);
  const { filePath } = result;

  // Refuse to overwrite malformed configuration with a partial edit.
  if (result.warning) {
    return {
      ok: false,
      reason: `Theme Sync did not change the ${scope} config file at ${filePath}. It must be readable and contain a valid JSON object. Fix the file and try again.`,
    };
  }

  const nextConfig: LoadedConfig = structuredClone(result.config ?? {});

  if (changes["themes.light"] !== undefined) {
    nextConfig.themes = {
      ...(nextConfig.themes ?? {}),
      light: changes["themes.light"],
    };
  }

  if (changes["themes.dark"] !== undefined) {
    nextConfig.themes = {
      ...(nextConfig.themes ?? {}),
      dark: changes["themes.dark"],
    };
  }

  if (changes["detection.pollIntervalMs"] !== undefined) {
    nextConfig.detection = {
      ...(nextConfig.detection ?? {}),
      pollIntervalMs: changes["detection.pollIntervalMs"],
    };
  }

  if (changes.isSyncActive !== undefined) {
    nextConfig.isSyncActive = changes.isSyncActive;
  }

  await writeJsonFile(filePath, nextConfig);

  return { ok: true };
}

async function readJsonIfExists(filePath: string): Promise<ReadJsonResult> {
  let content: string;

  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    return isNotFoundError(error)
      ? { missing: true }
      : { warning: unreadableConfigWarning(filePath, error) };
  }

  const parsed = parseJsonObject(content);

  return parsed.ok
    ? { config: parsed.value }
    : { warning: malformedConfigWarning(filePath, parsed) };
}

async function readScopedConfig(
  scope: ConfigScope,
  cwd: string,
): Promise<ReadJsonResult & { filePath: string }> {
  const preferredPath =
    scope === "project" ? CONFIG_PATHS.project(cwd) : CONFIG_PATHS.global;
  const preferred = await readJsonIfExists(preferredPath);

  if (!preferred.missing) {
    return { ...preferred, filePath: preferredPath };
  }

  const legacyPath = path.join(
    path.dirname(path.dirname(preferredPath)),
    "theme-sync.json",
  );
  const legacy = await readJsonIfExists(legacyPath);

  return legacy.missing
    ? { ...preferred, filePath: preferredPath }
    : { ...legacy, filePath: legacyPath };
}

/**
 * Resolves one setting from project, then global, then the default, skipping
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

/** Label that starts a setting warning, naming the file's scope. */
function scopeLabel(scope: ConfigScope): string {
  return scope === "project" ? "Project" : "Global";
}

function valid<T>(value: T): ParsedSetting<T> {
  return { kind: "valid", value };
}
