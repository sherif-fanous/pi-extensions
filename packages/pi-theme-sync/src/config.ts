/** Loads, validates, and saves global and project configuration. */

import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ConfigScope,
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

type ReadJsonResult = {
  missing?: true;
  config?: LoadedConfig;
  warning?: string;
};

type SaveResult = { ok: true } | { ok: false; reason: string };

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

  const projectIsSyncActive = validIsSyncActive(
    projectLoadedConfig?.isSyncActive,
  );
  const globalIsSyncActive = validIsSyncActive(
    globalLoadedConfig?.isSyncActive,
  );
  const isSyncActiveSource = resolveSource(
    projectIsSyncActive,
    globalIsSyncActive,
  );

  warnInvalidIsSyncActive(
    "project",
    projectLoadedConfig?.isSyncActive,
    isSyncActiveSource,
    warnings,
  );

  warnInvalidIsSyncActive(
    "global",
    globalLoadedConfig?.isSyncActive,
    isSyncActiveSource,
    warnings,
  );

  const lightThemeSource = resolveSource(
    projectLoadedConfig?.themes?.light,
    globalLoadedConfig?.themes?.light,
  );
  const lightTheme = validateTheme(
    projectLoadedConfig?.themes?.light ?? globalLoadedConfig?.themes?.light,
    "light",
    lightThemeSource,
    availableThemes,
    warnings,
  );
  const darkThemeSource = resolveSource(
    projectLoadedConfig?.themes?.dark,
    globalLoadedConfig?.themes?.dark,
  );
  const darkTheme = validateTheme(
    projectLoadedConfig?.themes?.dark ?? globalLoadedConfig?.themes?.dark,
    "dark",
    darkThemeSource,
    availableThemes,
    warnings,
  );
  const pollIntervalMsSource = resolveSource(
    projectLoadedConfig?.detection?.pollIntervalMs,
    globalLoadedConfig?.detection?.pollIntervalMs,
  );
  const pollIntervalMs = validatePollingIntervalMs(
    projectLoadedConfig?.detection?.pollIntervalMs ??
      globalLoadedConfig?.detection?.pollIntervalMs,
    pollIntervalMsSource,
    warnings,
  );

  const runtimeConfigSources: RuntimeConfigSources = {
    isSyncActive: isSyncActiveSource,

    themes: {
      light: lightTheme.source,
      dark: darkTheme.source,
    },

    detection: {
      pollIntervalMs: pollIntervalMs.source,
    },
  };

  const runtimeConfig: RuntimeConfig = {
    isSyncActive:
      projectIsSyncActive ?? globalIsSyncActive ?? DEFAULT_CONFIG.isSyncActive,

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

function resolveSource<T>(
  projectValue: T | null | undefined,
  globalValue: T | null | undefined,
): ConfigScope | "default" {
  if (projectValue != null) {
    return "project";
  }

  if (globalValue != null) {
    return "global";
  }

  return "default";
}

/** Label that starts a setting warning, naming the file's scope. */
function scopeLabel(scope: ConfigScope): string {
  return scope === "project" ? "Project" : "Global";
}

function validatePollingIntervalMs(
  value: number | undefined,
  source: ConfigScope | "default",
  warnings: string[],
): { source: ConfigScope | "default"; value: number } {
  if (value === undefined) {
    return {
      source: "default",
      value: DEFAULT_CONFIG.detection.pollIntervalMs,
    };
  }

  if (typeof value !== "number" || !isValidPollIntervalMs(value)) {
    const scope = scopeLabel(source === "project" ? "project" : "global");

    warnings.push(
      `${scope} setting "pollIntervalMs" must be a number between ${POLL_INTERVAL_MIN_MS} and ${POLL_INTERVAL_MAX_MS} milliseconds, not ${JSON.stringify(value)}. Using the default value ${DEFAULT_CONFIG.detection.pollIntervalMs}.`,
    );

    return {
      source: "default",
      value: DEFAULT_CONFIG.detection.pollIntervalMs,
    };
  }

  return { source, value };
}

function validateTheme(
  themeName: string | undefined,
  fallback: "light" | "dark",
  source: ConfigScope | "default",
  availableThemes: Set<string>,
  warnings: string[],
): { source: ConfigScope | "default"; value: string } {
  if (!themeName) {
    return { source: "default", value: DEFAULT_CONFIG.themes[fallback] };
  }

  if (!availableThemes.has(themeName)) {
    warnings.push(
      `Theme "${themeName}" was not found in Pi. Using the default theme "${DEFAULT_CONFIG.themes[fallback]}".`,
    );

    return { source: "default", value: DEFAULT_CONFIG.themes[fallback] };
  }

  return { source, value: themeName };
}

function validIsSyncActive(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Warn about an `isSyncActive` value that is not a boolean. The warning
 * names the default when no scope supplies a valid value, and otherwise
 * says the value was ignored, since the other scope's value applies.
 */
function warnInvalidIsSyncActive(
  scope: ConfigScope,
  value: unknown,
  effectiveSource: ConfigScope | "default",
  warnings: string[],
): void {
  if (value === undefined || typeof value === "boolean") return;

  const outcome =
    effectiveSource === "default"
      ? `Using the default value ${String(DEFAULT_CONFIG.isSyncActive)}.`
      : "Ignored it.";

  warnings.push(
    `${scopeLabel(scope)} setting "isSyncActive" must be a boolean, not ${JSON.stringify(value)}. ${outcome}`,
  );
}
