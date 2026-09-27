/**
 * Resolves the consolidated configuration paths and legacy migration inputs for
 * both storage scopes.
 */
import {
  extensionConfigPath,
  projectConfigPath,
} from "@sherif-fanous/pi-extensions-core";

/** File name for the legacy user-global access policy. */
const POLICY_FILE_NAME = "policy.json";
/** File name for the user-global extension configuration. */
const CONFIG_FILE_NAME = "config.json";
/** File name for legacy preset lists within `PRESETS_PLUS_SUBDIR`. */
const PRESETS_FILE_NAME = "presets.json";
/** Subdirectory under both scopes that contains preset-related files. */
const PRESETS_PLUS_SUBDIR = "presets-plus";

/** Absolute path to the user-global version 2 configuration file. */
export function getGlobalConfigPath(agentDir?: string): string {
  return extensionConfigPath({
    extension: PRESETS_PLUS_SUBDIR,
    file: CONFIG_FILE_NAME,
    agentDir,
  });
}

/** Absolute path to the user-global legacy policy file. */
export function getGlobalPolicyPath(agentDir?: string): string {
  return extensionConfigPath({
    extension: PRESETS_PLUS_SUBDIR,
    file: POLICY_FILE_NAME,
    agentDir,
  });
}

/** Absolute path to the user-scope legacy preset file. */
export function getGlobalPresetsPath(agentDir?: string): string {
  return extensionConfigPath({
    extension: PRESETS_PLUS_SUBDIR,
    file: PRESETS_FILE_NAME,
    agentDir,
  });
}

/** Absolute path to the project-scope version 2 configuration file. */
export function getProjectConfigPath(cwd: string): string {
  return projectConfigPath({
    cwd,
    extension: PRESETS_PLUS_SUBDIR,
    file: CONFIG_FILE_NAME,
  });
}

/** Absolute path to the project-scope legacy preset file. */
export function getProjectPresetsPath(cwd: string): string {
  return projectConfigPath({
    cwd,
    extension: PRESETS_PLUS_SUBDIR,
    file: PRESETS_FILE_NAME,
  });
}
