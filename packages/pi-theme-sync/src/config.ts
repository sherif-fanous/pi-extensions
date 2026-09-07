/**
 * Configuration load / persist / validation.
 *
 * Owns the global and project JSON file paths, the `loadConfig` and
 * `writeConfigChanges` APIs, and the per-key validation helpers that emit
 * warnings rather than throwing. Does NOT own runtime application of
 * config (lives in `runtime.ts`) or the editing UI (lives in `command.ts`).
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
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

export const CONFIG_PATHS = {
  global: path.join(homedir(), ".pi", "agent", "theme-sync.json"),
  project: (cwd: string) => path.join(cwd, ".pi", "theme-sync.json"),
};

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

export const POLL_INTERVAL_MIN_MS = 1000;

type ReadJsonResult = {
  config?: LoadedConfig;
  warning?: string;
};

export function isValidPollIntervalMs(value: number): boolean {
  return Number.isFinite(value) && value >= POLL_INTERVAL_MIN_MS;
}

export async function loadConfig(
  ctx: ExtensionContext,
): Promise<LoadedRuntimeConfig> {
  const warnings: string[] = [];

  const globalResult = await readJsonIfExists(CONFIG_PATHS.global);
  const projectResult = await readJsonIfExists(CONFIG_PATHS.project(ctx.cwd));

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

  const projectIsSyncActive = validateIsSyncActive(
    projectLoadedConfig?.isSyncActive,
    "Project config",
    warnings,
  );
  const globalIsSyncActive = validateIsSyncActive(
    globalLoadedConfig?.isSyncActive,
    "Global config",
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
    isSyncActive: resolveSource(projectIsSyncActive, globalIsSyncActive),

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
    loadedConfig: {
      project: projectLoadedConfig,
      global: globalLoadedConfig,
    },
    runtimeConfig,
    runtimeConfigSources,
    warnings,
  };
}

export async function writeConfigChanges(
  scope: ConfigScope,
  cwd: string,
  changes: EditableConfigChanges,
): Promise<void> {
  if (Object.keys(changes).length === 0) {
    return;
  }

  const filePath = getConfigPath(scope, cwd);
  const result = await readJsonIfExists(filePath);
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

  await writeJson(filePath, nextConfig);
}

function getConfigPath(scope: ConfigScope, cwd: string): string {
  return scope === "project" ? CONFIG_PATHS.project(cwd) : CONFIG_PATHS.global;
}

async function readJsonIfExists(filePath: string): Promise<ReadJsonResult> {
  let content: string;

  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }

  try {
    const parsed = JSON.parse(content) as LoadedConfig;

    return { config: parsed };
  } catch {
    return {
      warning: `Invalid JSON in ${filePath} — file ignored`,
    };
  }
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

function validateIsSyncActive(
  value: unknown,
  scope: string,
  warnings: string[],
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    warnings.push(
      `${scope}: isSyncActive "${JSON.stringify(value)}" is not a boolean — ignored`,
    );

    return undefined;
  }

  return value;
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
    const scope = source === "project" ? "Project config" : "Global config";

    warnings.push(
      `${scope}: pollIntervalMs "${String(value)}" is not a number >= ${POLL_INTERVAL_MIN_MS} — using default (${DEFAULT_CONFIG.detection.pollIntervalMs}ms)`,
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
      `Theme "${themeName}" not found in Pi — using default "${DEFAULT_CONFIG.themes[fallback]}"`,
    );

    return { source: "default", value: DEFAULT_CONFIG.themes[fallback] };
  }

  return { source, value: themeName };
}

async function writeJson(
  filePath: string,
  config: LoadedConfig,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
