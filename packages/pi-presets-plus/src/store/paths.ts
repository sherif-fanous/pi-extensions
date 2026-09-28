/**
 * Resolves the configuration file of each scope and the legacy files the
 * startup migration reads.
 */
import type { PresetScope } from "../types.js";
import {
  configFilePath,
  extensionConfigPath,
  projectConfigPath,
} from "@sherif-fanous/pi-extensions-core";

/** Configuration directory under both scopes, the extension's slug. */
const PRESETS_PLUS_SLUG = "presets-plus";

/** File name for the legacy user access policy. */
const POLICY_FILE_NAME = "policy.json";
/** File name for legacy preset lists within `PRESETS_PLUS_SLUG`. */
const PRESETS_FILE_NAME = "presets.json";

/** Absolute path to one scope's `config.json`. */
export function getConfigPath(
  scope: PresetScope,
  cwd: string,
  agentDir?: string,
): string {
  return configFilePath(scope, { agentDir, cwd, extension: PRESETS_PLUS_SLUG });
}

/** Absolute path to the project-scope legacy preset file. */
export function getProjectPresetsPath(cwd: string): string {
  return projectConfigPath({
    cwd,
    extension: PRESETS_PLUS_SLUG,
    file: PRESETS_FILE_NAME,
  });
}

/** Absolute path to the user-scope legacy policy file. */
export function getUserPolicyPath(agentDir?: string): string {
  return extensionConfigPath({
    agentDir,
    extension: PRESETS_PLUS_SLUG,
    file: POLICY_FILE_NAME,
  });
}

/** Absolute path to the user-scope legacy preset file. */
export function getUserPresetsPath(agentDir?: string): string {
  return extensionConfigPath({
    agentDir,
    extension: PRESETS_PLUS_SLUG,
    file: PRESETS_FILE_NAME,
  });
}
