/**
 * Reads the User `config.json`, validates each supported setting against
 * its limits, and at session start rewrites renamed keys under their new
 * names.
 *
 * The file is re-read on every session start rather than cached, so an
 * edit followed by `/reload` takes effect without restarting Pi.
 */

import { EXTENSION_NAME } from "./extension-name.js";
import type { NotificationConfig, ToastConfig } from "./types.js";
import {
  defineConfigFile,
  isRecord,
  type ConfigContext,
  type ConfigOutcome,
} from "@sherif-fanous/pi-extensions-core";

/**
 * An always-usable configuration and what reading the User file found,
 * with one value warning per invalid setting.
 */
export interface LoadedConfig {
  readonly config: NotificationConfig;
  /**
   * The User file, the value warnings, and at session start what migrated,
   * for the startup notification and the status report.
   */
  readonly outcome: ConfigOutcome<"user">;
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
 * unsupported file yields the defaults, with its problem on the outcome's
 * file. A missing setting takes its default silently; an invalid one
 * takes its default and adds a value warning. Unknown keys are ignored.
 */
export async function loadConfig(ctx: ConfigContext): Promise<LoadedConfig> {
  const outcome = await NOTIFICATION_CENTER_CONFIG.load(ctx);
  const { user: file } = outcome.files;
  const { config, warnings } = resolveConfig(
    file.state === "loaded" ? file.data : {},
  );

  return { config, outcome: outcome.withValueWarnings(warnings) };
}

/**
 * Rewrite a file that still uses old key names under the new names with
 * the current `version`, then load the configuration for a new session.
 *
 * The session uses the renamed values whether or not the rewrite
 * succeeds.
 */
export async function loadStartupConfig(
  ctx: ConfigContext,
): Promise<LoadedConfig> {
  const migration = await NOTIFICATION_CENTER_CONFIG.migrateKeys(ctx);
  const loaded = await loadConfig(ctx);

  return { ...loaded, outcome: loaded.outcome.withMigrations(migration) };
}

/** Notification Center's User `config.json`. */
const NOTIFICATION_CENTER_CONFIG = defineConfigFile({
  extension: "notification-center",
  extensionName: EXTENSION_NAME,
  renamedKeys: [
    { from: "maxToastsVisible", to: "toast.maxVisible" },
    { from: "toast.timeout", to: "toast.timeoutMs" },
  ],
  scopes: ["user"],
  version: CONFIG_VERSION,
});

/** Supported setting paths, derived from the limits so none is skipped. */
const CONFIG_PATHS = Object.keys(CONFIG_LIMITS) as readonly ConfigPath[];

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
