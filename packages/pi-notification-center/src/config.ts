/**
 * Global toast configuration loading and validation.
 *
 * Owns reading `<agent-dir>/notification-center/config.json`, validating
 * each supported field against its documented range, and reporting
 * rejected values as warning strings. It does NOT own the defaults or
 * ranges themselves (see `types.ts`), notification delivery, or the
 * decision about how a warning reaches the user.
 *
 * The file is re-read on every session start rather than cached, so a
 * user edit followed by `/reload` takes effect without restarting Pi.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONFIG_RANGES,
  DEFAULT_CONFIG,
  type ConfigPath,
  type NotificationConfig,
  type ToastConfig,
} from "./types.js";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Minimal file-reading seam so tests do not need a real agent directory. */
export interface ConfigFs {
  readFileSync(path: string): string;
}

/** Outcome of a configuration load: always usable, plus any complaints. */
export interface LoadConfigResult {
  config: NotificationConfig;
  /**
   * Human-readable descriptions of rejected input. Empty when the file is
   * absent or fully valid. Callers surface these as a single warning.
   */
  warnings: string[];
}

/** Absolute path of the notification-center configuration file. */
export function getConfigPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, "notification-center", "config.json");
}

/**
 * Load and validate the optional configuration file.
 *
 * Behavior matrix:
 * - file absent -> all defaults, no warnings (a missing file is the
 *   expected case and must stay silent)
 * - unreadable or unparsable -> all defaults, one warning
 * - not a JSON object -> all defaults, one warning
 * - field missing -> that field's default, no warning
 * - field present but invalid -> that field's default, one warning
 * - unknown key -> ignored silently, for forward compatibility
 */
export function loadConfig(
  agentDir: string = getAgentDir(),
  fs: ConfigFs = DEFAULT_CONFIG_FS,
): LoadConfigResult {
  const path = getConfigPath(agentDir);

  let contents: string;

  try {
    contents = fs.readFileSync(path);
  } catch (err) {
    // A missing file is the documented default state, so only a genuine
    // read failure is worth reporting.
    if (isMissingFileError(err)) {
      return { config: defaults(), warnings: [] };
    }

    return {
      config: defaults(),
      warnings: [
        `Notification-center configuration at ${path} could not be read. The extension is using default settings.`,
      ],
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    return {
      config: defaults(),
      warnings: [
        `Notification-center configuration at ${path} is not valid JSON. The extension is using default settings.`,
      ],
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      config: defaults(),
      warnings: [
        `Notification-center configuration at ${path} must be a JSON object. The extension is using default settings.`,
      ],
    };
  }

  const record = parsed as Record<string, unknown>;
  const config = defaults();
  const warnings: string[] = [];
  const nested = record.toast;

  if (nested !== undefined && !isPlainObject(nested)) {
    warnings.push(
      `Notification-center setting "toast" must be a JSON object. The extension is using default toast settings.`,
    );
  }

  const toastRecord = isPlainObject(nested) ? nested : {};

  for (const path of CONFIG_PATHS) {
    const raw =
      path === "maxToastsVisible"
        ? record[path]
        : toastRecord[path.slice("toast.".length)];

    if (raw === undefined) continue;

    const range = CONFIG_RANGES[path];

    if (!isValidFieldValue(raw, range)) {
      warnings.push(
        `Notification-center setting "${path}" must be an integer from ${String(range.min)} through ${String(range.max)}. The extension is using the default value ${String(defaultFor(path))}.`,
      );

      continue;
    }

    if (path === "maxToastsVisible") {
      config.maxToastsVisible = raw;
    } else {
      config.toast[path.slice("toast.".length) as keyof ToastConfig] = raw;
    }
  }

  return { config, warnings };
}

/** Supported configuration paths. Any other key is ignored on read. */
const CONFIG_PATHS: readonly ConfigPath[] = [
  "maxToastsVisible",
  "toast.maxLines",
  "toast.timeout",
  "toast.width",
] as const;

const DEFAULT_CONFIG_FS: ConfigFs = {
  readFileSync: (path) => readFileSync(path, "utf8"),
};

function defaultFor(path: ConfigPath): number {
  return path === "maxToastsVisible"
    ? DEFAULT_CONFIG.maxToastsVisible
    : DEFAULT_CONFIG.toast[path.slice("toast.".length) as keyof ToastConfig];
}

/**
 * A fresh, fully-defaulted configuration.
 *
 * The nested `toast` object is copied too, so a caller mutating the
 * result can never write through to {@link DEFAULT_CONFIG}.
 */
function defaults(): NotificationConfig {
  return {
    maxToastsVisible: DEFAULT_CONFIG.maxToastsVisible,
    toast: { ...DEFAULT_CONFIG.toast },
  };
}

function isMissingFileError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidFieldValue(
  raw: unknown,
  range: { readonly max: number; readonly min: number },
): raw is number {
  return (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= range.min &&
    raw <= range.max
  );
}
