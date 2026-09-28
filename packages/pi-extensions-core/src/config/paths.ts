/**
 * Locations of per-extension configuration files in Pi's agent directory
 * and in a project.
 */

import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Path to an extension's file in Pi's agent directory:
 * `<agentDir>/<extension>/<file>`.
 *
 * `agentDir` defaults to Pi's `getAgentDir()`, which honors the agent
 * directory override. Tests pass their own directory.
 */
export function extensionConfigPath({
  agentDir = getAgentDir(),
  extension,
  file,
}: {
  agentDir?: string;
  extension: string;
  file: string;
}): string {
  return join(agentDir, extension, file);
}

/**
 * Path to an extension's file in a project:
 * `<cwd>/<CONFIG_DIR_NAME>/<extension>/<file>`, where `CONFIG_DIR_NAME` is
 * Pi's project configuration directory name (`.pi`).
 */
export function projectConfigPath({
  cwd,
  extension,
  file,
}: {
  cwd: string;
  extension: string;
  file: string;
}): string {
  return join(cwd, CONFIG_DIR_NAME, extension, file);
}
