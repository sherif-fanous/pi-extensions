/**
 * Reads the User `config.json`, validates each supported setting against
 * its limits, and at session start rewrites renamed keys under their new
 * names.
 *
 * The file is re-read on every session start rather than cached, so an
 * edit followed by `/reload` takes effect without restarting Pi.
 */

import type { NotificationConfig, ToastConfig } from "./types.js";
import {
  isRecord,
  loadConfigFiles,
  migrateRenamedConfigKeys,
  type AtomicWriteFs,
  type ConfigContext,
  type ConfigFile,
  type ConfigFileFs,
  type ConfigKeyRename,
} from "@sherif-fanous/pi-extensions-core";

/** Where the loader reads and writes; tests pass their own. */
export interface ConfigOptions {
  /** Pi's agent directory. Defaults to `getAgentDir()`. */
  readonly agentDir?: string;
  /** Write seam for the startup migration. */
  readonly atomicWriteFs?: AtomicWriteFs;
  readonly fs?: ConfigFileFs;
}

/**
 * An always-usable configuration, the file it came from, and the invalid
 * values rejected along the way.
 */
export interface LoadedConfig {
  readonly config: NotificationConfig;
  /** What reading the User file found, for warnings and the status report. */
  readonly file: ConfigFile;
  /**
   * One warning per invalid value. File problems stay on `file`, so they
   * show in the status report's `Config:` block rather than here.
   */
  readonly warnings: readonly string[];
}

/** The configuration a session starts with, after migrating renamed keys. */
export interface StartupConfig extends LoadedConfig {
  /** The file rewritten under the new key names, if any. */
  readonly migrated: readonly string[];
  /** One warning per file the migration could not rewrite. */
  readonly migrationWarnings: readonly string[];
}

/** Dotted path of every supported setting. */
export type ConfigPath = `toast.${keyof ToastConfig}`;

/** The `version` this release reads and writes. */
export const CONFIG_VERSION = 2;

/**
 * Inclusive integer limits of every supported setting, in the order
 * warnings report them. Validation and the README both use these.
 */
export const CONFIG_LIMITS: {
  readonly [Path in ConfigPath]: {
    readonly max: number;
    readonly min: number;
  };
} = {
  "toast.maxLines": { max: 20, min: 1 },
  "toast.maxVisible": { max: 10, min: 1 },
  "toast.timeoutMs": { max: 60_000, min: 250 },
  "toast.width": { max: 80, min: 20 },
} as const;

/** Configuration defaults, used whenever a value is missing or invalid. */
export const DEFAULT_CONFIG = {
  toast: {
    maxLines: 5,
    maxVisible: 5,
    timeoutMs: 3000,
    width: 64,
  },
} as const satisfies NotificationConfig;

/**
 * Read and validate the User configuration file.
 *
 * Notification Center has only the User scope, so it never reads a
 * Project file and never asks Pi whether the project is trusted. A
 * missing file yields the defaults silently. An unreadable, malformed, or
 * unsupported file yields the defaults, with its problem on `file`. A
 * missing setting takes its default silently; an invalid one takes its
 * default and adds a warning. Unknown keys are ignored.
 */
export async function loadConfig(
  ctx: ConfigContext,
  options: ConfigOptions = {},
): Promise<LoadedConfig> {
  const { user: file } = await loadConfigFiles(ctx, {
    agentDir: options.agentDir,
    extension: CONFIG_EXTENSION,
    fs: options.fs,
    renamedKeys: RENAMED_CONFIG_KEYS,
    scopes: ["user"],
    version: CONFIG_VERSION,
  });

  return {
    ...resolveConfig(file.state === "loaded" ? file.data : {}),
    file,
  };
}

/**
 * Load the configuration for a new session, then rewrite a file that
 * still uses old key names under the new names with the current
 * `version`.
 *
 * The session uses the renamed values whether or not the rewrite
 * succeeds.
 */
export async function loadStartupConfig(
  ctx: ConfigContext,
  options: ConfigOptions = {},
): Promise<StartupConfig> {
  const loaded = await loadConfig(ctx, options);
  const migration = await migrateRenamedConfigKeys(
    [loaded.file],
    CONFIG_VERSION,
    options.atomicWriteFs,
  );

  return {
    ...loaded,
    migrated: migration.migrated,
    migrationWarnings: migration.warnings,
  };
}

/** The slug that names Notification Center's configuration directory. */
const CONFIG_EXTENSION = "notification-center";

/** Supported setting paths, derived from the limits so none is skipped. */
const CONFIG_PATHS = Object.keys(CONFIG_LIMITS) as readonly ConfigPath[];

/** Keys read under their old name while the new name is absent. */
const RENAMED_CONFIG_KEYS: readonly ConfigKeyRename[] = [
  { from: "maxToastsVisible", to: "toast.maxVisible" },
  { from: "toast.timeout", to: "toast.timeoutMs" },
];

function isValidSettingValue(
  raw: unknown,
  limits: { readonly max: number; readonly min: number },
): raw is number {
  return (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= limits.min &&
    raw <= limits.max
  );
}

/** Validate each supported setting of a loaded document. */
function resolveConfig(document: Record<string, unknown>): {
  config: NotificationConfig;
  warnings: string[];
} {
  // A copy, so a caller changing the result cannot write through to
  // DEFAULT_CONFIG.
  const config: NotificationConfig = { toast: { ...DEFAULT_CONFIG.toast } };
  const warnings: string[] = [];
  const { toast } = document;

  if (toast !== undefined && !isRecord(toast)) {
    warnings.push(
      `Setting "toast" must be a JSON object, not ${JSON.stringify(toast)}. Using default toast settings.`,
    );
  }

  const toastRecord = isRecord(toast) ? toast : {};

  for (const path of CONFIG_PATHS) {
    const key = path.slice("toast.".length) as keyof ToastConfig;
    const raw = toastRecord[key];

    if (raw === undefined) continue;

    const limits = CONFIG_LIMITS[path];

    if (!isValidSettingValue(raw, limits)) {
      warnings.push(
        `Setting "${path}" must be an integer from ${String(limits.min)} through ${String(limits.max)}, not ${JSON.stringify(raw)}. Using the default value ${String(DEFAULT_CONFIG.toast[key])}.`,
      );

      continue;
    }

    config.toast[key] = raw;
  }

  return { config, warnings };
}
