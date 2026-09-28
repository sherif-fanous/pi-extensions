/**
 * Loads and validates one scope's `config.json`.
 * Section warnings preserve fail-open reads while marking the document unsafe to rewrite.
 */
import { access } from "node:fs/promises";

import type {
  ConfigDocument,
  Preset,
  PresetScope,
  ScopeConfig,
  ScopeWarnings,
} from "../types.js";
import { parsePresetArray } from "./load.js";
import { getConfigPath, getProjectPresetsPath } from "./paths.js";
import {
  configFileWarnings,
  isNotFoundError,
  isRecord,
  readConfigFile,
  untrustedProjectConfigWarning,
  type ConfigFile,
} from "@sherif-fanous/pi-extensions-core";

/** The `version` this release reads and writes. */
export const CONFIG_VERSION = 2;

/** The value of every setting that no scope sets. */
export const DEFAULT_CONFIG = { showInactiveStatus: true } as const;

/** Where one scope's configuration lives and whether Pi trusts the project. */
export interface ScopeLocation {
  /** Pi's agent directory. Defaults to `getAgentDir()`; tests pass their own. */
  readonly agentDir?: string;
  readonly cwd: string;
  /**
   * Whether Pi trusts the project, from `ctx.isProjectTrusted()`. Only the
   * project scope consults it.
   */
  readonly trusted: boolean;
}

/** Load one scope's complete document and validated preset section. */
export async function loadScope(
  scope: PresetScope,
  location: ScopeLocation,
): Promise<ScopeConfig> {
  const file = await readScopeFile(scope, location);
  const warnings: ScopeWarnings = {
    file: configFileWarnings([file]),
    presets: [],
    policy: [],
  };

  if (file.state !== "loaded")
    return { document: {}, file, presets: [], warnings };

  const { path } = file;
  const document = file.data as ConfigDocument;
  let showInactiveStatus: boolean | undefined;
  let invalidShowInactiveStatus: { value: unknown } | undefined;

  if (document.showInactiveStatus !== undefined) {
    if (typeof document.showInactiveStatus !== "boolean") {
      invalidShowInactiveStatus = { value: document.showInactiveStatus };
    } else {
      showInactiveStatus = document.showInactiveStatus;
    }
  }

  let presets: Preset[] = [];

  if (document.presets !== undefined) {
    if (!Array.isArray(document.presets)) {
      warnings.presets.push(
        `The config file ${path} has an invalid "presets" value; expected an array.`,
      );
    } else {
      const result = parsePresetArray(document.presets, path);

      presets = result.presets;
      warnings.presets.push(...result.warnings);
    }
  }

  if (scope === "project" && document.policy !== undefined) {
    warnings.policy.push(
      `The project config file ${path} contains policy, but policy is supported only in the user configuration.`,
    );
  } else if (scope === "user" && document.policy !== undefined) {
    if (!isRecord(document.policy) || !Array.isArray(document.policy.rules)) {
      warnings.policy.push(
        `The config file ${path} has an invalid "policy" section; expected an object with a "rules" array.`,
      );
    }
  }

  return {
    document,
    file,
    presets,
    ...(showInactiveStatus === undefined ? {} : { showInactiveStatus }),
    ...(invalidShowInactiveStatus === undefined
      ? {}
      : { invalidShowInactiveStatus }),
    warnings,
  };
}

/**
 * Read one scope's `config.json`. In an untrusted project without one, a
 * legacy `presets.json` the migration left alone is reported as skipped
 * too, since it is still project configuration.
 */
async function readScopeFile(
  scope: PresetScope,
  { agentDir, cwd, trusted }: ScopeLocation,
): Promise<ConfigFile> {
  const file = await readConfigFile({
    path: getConfigPath(scope, cwd, agentDir),
    scope,
    trusted,
    version: CONFIG_VERSION,
  });

  if (file.state !== "missing" || scope === "user" || trusted) return file;

  const legacyPath = getProjectPresetsPath(cwd);

  try {
    await access(legacyPath);
  } catch (error) {
    if (isNotFoundError(error)) return file;
  }

  return {
    path: legacyPath,
    scope,
    state: "untrusted",
    warning: untrustedProjectConfigWarning(legacyPath),
  };
}
