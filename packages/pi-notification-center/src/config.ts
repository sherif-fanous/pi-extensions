/**
 * Reads `<agent-dir>/notification-center/config.json`, validates each
 * supported field against its range, and reports rejected values as
 * warning strings.
 *
 * The file is re-read on every session start rather than cached, so an
 * edit followed by `/reload` takes effect without restarting Pi.
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

/** File-reading seam so tests do not need a real agent directory. */
export interface ConfigFs {
  readFileSync(path: string): string;
}

/** An always-usable configuration, plus anything rejected along the way. */
export interface LoadConfigResult {
  config: NotificationConfig;
  /**
   * Descriptions of rejected input, empty when the file is absent or
   * fully valid.
   */
  warnings: string[];
}

/**
 * Load and validate the optional configuration file.
 *
 * A missing file yields the defaults with no warnings. An unreadable,
 * unparsable, or non-object file yields the defaults with one warning. A
 * missing field takes its default silently; a present but invalid field
 * takes its default and adds a warning. Unknown keys are ignored.
 */
export function loadConfig(
  agentDir: string = getAgentDir(),
  fs: ConfigFs = DEFAULT_CONFIG_FS,
): LoadConfigResult {
  const configFilePath = join(agentDir, "notification-center", "config.json");

  let contents: string;

  try {
    contents = fs.readFileSync(configFilePath);
  } catch (err) {
    if (isMissingFileError(err)) {
      return { config: defaults(), warnings: [] };
    }

    return {
      config: defaults(),
      warnings: [
        `Notification-center configuration at ${configFilePath} could not be read. The extension is using default settings.`,
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
        `Notification-center configuration at ${configFilePath} is not valid JSON. The extension is using default settings.`,
      ],
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      config: defaults(),
      warnings: [
        `Notification-center configuration at ${configFilePath} must be a JSON object. The extension is using default settings.`,
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
    // `undefined` marks the one top-level setting; every other path names
    // a field of the nested toast object.
    const leaf =
      path === "maxToastsVisible"
        ? undefined
        : (path.slice("toast.".length) as keyof ToastConfig);
    const raw = leaf === undefined ? record[path] : toastRecord[leaf];

    if (raw === undefined) continue;

    const range = CONFIG_RANGES[path];

    if (!isValidFieldValue(raw, range)) {
      // Read from DEFAULT_CONFIG rather than `config`, which an earlier
      // iteration may already have written to.
      const fallback =
        leaf === undefined
          ? DEFAULT_CONFIG.maxToastsVisible
          : DEFAULT_CONFIG.toast[leaf];

      warnings.push(
        `Notification-center setting "${path}" must be an integer from ${String(range.min)} through ${String(range.max)}. The extension is using the default value ${String(fallback)}.`,
      );

      continue;
    }

    if (leaf === undefined) {
      config.maxToastsVisible = raw;
    } else {
      config.toast[leaf] = raw;
    }
  }

  return { config, warnings };
}

/**
 * Supported configuration paths, in the order warnings report them.
 *
 * Derived from the ranges rather than listed again, so a setting added
 * there cannot be skipped here.
 */
const CONFIG_PATHS = Object.keys(CONFIG_RANGES) as readonly ConfigPath[];

const DEFAULT_CONFIG_FS: ConfigFs = {
  readFileSync: (path) => readFileSync(path, "utf8"),
};

/**
 * Build a fresh, fully defaulted configuration.
 *
 * The nested `toast` object is copied too, so a caller mutating the
 * result cannot write through to {@link DEFAULT_CONFIG}.
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
