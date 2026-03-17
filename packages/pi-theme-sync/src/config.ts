import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { LoadedConfig, RuntimeConfig } from "./types.js";

const CONFIG_PATHS = {
  global: path.join(homedir(), ".pi", "agent", "theme-sync.json"),
  project: (cwd: string) => path.join(cwd, ".pi", "theme-sync.json"),
};

export const DEFAULT_CONFIG: RuntimeConfig = {
  themes: {
    light: "light",
    dark: "dark",
  },
  detection: {
    pollIntervalMs: 2000,
  },
};

async function readJsonIfExists(
  filePath: string,
): Promise<LoadedConfig | undefined> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as LoadedConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function loadConfig(
  ctx: ExtensionContext,
): Promise<RuntimeConfig> {
  const globalConfig = await readJsonIfExists(CONFIG_PATHS.global);
  const projectConfig = await readJsonIfExists(CONFIG_PATHS.project(ctx.cwd));

  const mergedConfig: LoadedConfig = {
    themes: {
      light:
        projectConfig?.themes?.light ??
        globalConfig?.themes?.light ??
        DEFAULT_CONFIG.themes.light,
      dark:
        projectConfig?.themes?.dark ??
        globalConfig?.themes?.dark ??
        DEFAULT_CONFIG.themes.dark,
    },
    detection: {
      pollIntervalMs:
        projectConfig?.detection?.pollIntervalMs ??
        globalConfig?.detection?.pollIntervalMs ??
        DEFAULT_CONFIG.detection.pollIntervalMs,
    },
  };

  const pollIntervalMs =
    typeof mergedConfig.detection?.pollIntervalMs === "number" &&
    mergedConfig.detection.pollIntervalMs > 0
      ? mergedConfig.detection.pollIntervalMs
      : DEFAULT_CONFIG.detection.pollIntervalMs;

  const availableThemes = new Set(
    ctx.ui.getAllThemes().map((theme) => theme.name),
  );

  let lightTheme = mergedConfig.themes?.light ?? DEFAULT_CONFIG.themes.light;
  let darkTheme = mergedConfig.themes?.dark ?? DEFAULT_CONFIG.themes.dark;

  if (!availableThemes.has(lightTheme)) {
    lightTheme = DEFAULT_CONFIG.themes.light;
  }

  if (!availableThemes.has(darkTheme)) {
    darkTheme = DEFAULT_CONFIG.themes.dark;
  }

  return {
    themes: {
      light: lightTheme,
      dark: darkTheme,
    },
    detection: {
      pollIntervalMs,
    },
  };
}
