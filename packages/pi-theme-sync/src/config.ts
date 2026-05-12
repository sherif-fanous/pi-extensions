import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  ConfigScope,
  EditableConfigKey,
  EditableConfigValue,
  LoadedConfig,
  LoadedRuntimeConfig,
  RuntimeConfig,
  RuntimeConfigSources,
} from "./types.js";

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

  const rawPollIntervalMs =
    projectLoadedConfig?.detection?.pollIntervalMs ??
    globalLoadedConfig?.detection?.pollIntervalMs;
  const pollIntervalMsScope =
    projectLoadedConfig?.detection?.pollIntervalMs !== undefined
      ? "Project config"
      : "Global config";

  const runtimeConfigSources: RuntimeConfigSources = {
    isSyncActive: resolveSource(projectIsSyncActive, globalIsSyncActive),

    themes: {
      light: resolveSource(
        projectLoadedConfig?.themes?.light,
        globalLoadedConfig?.themes?.light,
      ),
      dark: resolveSource(
        projectLoadedConfig?.themes?.dark,
        globalLoadedConfig?.themes?.dark,
      ),
    },

    detection: {
      pollIntervalMs: resolveSource(
        projectLoadedConfig?.detection?.pollIntervalMs,
        globalLoadedConfig?.detection?.pollIntervalMs,
      ),
    },
  };

  const runtimeConfig: RuntimeConfig = {
    isSyncActive:
      projectIsSyncActive ?? globalIsSyncActive ?? DEFAULT_CONFIG.isSyncActive,

    themes: {
      light: validateTheme(
        projectLoadedConfig?.themes?.light ?? globalLoadedConfig?.themes?.light,
        "light",
        availableThemes,
        warnings,
      ),
      dark: validateTheme(
        projectLoadedConfig?.themes?.dark ?? globalLoadedConfig?.themes?.dark,
        "dark",
        availableThemes,
        warnings,
      ),
    },

    detection: {
      pollIntervalMs: validatePollingIntervalMs(
        rawPollIntervalMs,
        pollIntervalMsScope,
        warnings,
      ),
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

export async function writeConfigValue(
  scope: ConfigScope,
  cwd: string,
  key: EditableConfigKey,
  value: EditableConfigValue,
): Promise<void> {
  const filePath = getConfigPath(scope, cwd);
  const result = await readJsonIfExists(filePath);
  const existingConfig = result.config ?? {};
  const nextConfig: LoadedConfig = structuredClone(existingConfig);

  switch (key) {
    case "themes.light":
      nextConfig.themes = {
        ...(nextConfig.themes ?? {}),
        light: String(value),
      };

      break;

    case "themes.dark":
      nextConfig.themes = {
        ...(nextConfig.themes ?? {}),
        dark: String(value),
      };

      break;

    case "detection.pollIntervalMs":
      nextConfig.detection = {
        ...(nextConfig.detection ?? {}),
        pollIntervalMs: Number(value),
      };

      break;

    case "isSyncActive":
      nextConfig.isSyncActive = Boolean(value);

      break;
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
  projectValue: T | undefined,
  globalValue: T | undefined,
): ConfigScope | "default" {
  if (projectValue !== undefined) {
    return "project";
  }

  if (globalValue !== undefined) {
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
  scope: string,
  warnings: string[],
): number {
  if (value === undefined) {
    return DEFAULT_CONFIG.detection.pollIntervalMs;
  }

  if (typeof value !== "number" || !isValidPollIntervalMs(value)) {
    warnings.push(
      `${scope}: pollIntervalMs "${String(value)}" is not a number >= ${POLL_INTERVAL_MIN_MS} — using default (${DEFAULT_CONFIG.detection.pollIntervalMs}ms)`,
    );

    return DEFAULT_CONFIG.detection.pollIntervalMs;
  }

  return value;
}

function validateTheme(
  themeName: string | undefined,
  fallback: "light" | "dark",
  availableThemes: Set<string>,
  warnings: string[],
): string {
  if (!themeName) {
    return DEFAULT_CONFIG.themes[fallback];
  }

  if (!availableThemes.has(themeName)) {
    warnings.push(
      `Theme "${themeName}" not found in Pi — using default "${DEFAULT_CONFIG.themes[fallback]}"`,
    );

    return DEFAULT_CONFIG.themes[fallback];
  }

  return themeName;
}

async function writeJson(
  filePath: string,
  config: LoadedConfig,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
