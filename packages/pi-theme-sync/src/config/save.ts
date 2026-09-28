/** Saves the overlay's changed settings to the User or Project `config.json`. */

import type { EditableConfigChanges } from "../types.js";
import {
  CONFIG_EXTENSION,
  CONFIG_VERSION,
  RENAMED_CONFIG_KEYS,
  type ConfigOptions,
} from "./load.js";
import {
  configFilePath,
  isRecord,
  updateConfigFile,
  type AtomicWriteFs,
  type ConfigContext,
  type ConfigScope,
} from "@sherif-fanous/pi-extensions-core";

/** Where `writeConfigChanges` reads and writes; tests pass their own. */
export interface SaveConfigOptions extends ConfigOptions {
  readonly atomicWriteFs?: AtomicWriteFs;
}

/** Path of Theme Sync's `config.json` in one scope. */
export function configPath(
  scope: ConfigScope,
  ctx: Pick<ConfigContext, "cwd">,
  agentDir?: string,
): string {
  return configFilePath(scope, {
    agentDir,
    cwd: ctx.cwd,
    extension: CONFIG_EXTENSION,
  });
}

/**
 * Merge changed settings into one scope's file, keeping every other key.
 *
 * Throws, leaving the file untouched, when the project is not trusted,
 * the file is invalid, or the write fails.
 */
export async function writeConfigChanges(
  scope: ConfigScope,
  ctx: ConfigContext,
  changes: EditableConfigChanges,
  options: SaveConfigOptions = {},
): Promise<void> {
  if (Object.keys(changes).length === 0) return;

  await updateConfigFile(
    {
      atomicWriteFs: options.atomicWriteFs,
      fs: options.fs,
      path: configPath(scope, ctx, options.agentDir),
      renamedKeys: RENAMED_CONFIG_KEYS,
      scope,
      trusted: scope === "user" || ctx.isProjectTrusted(),
      version: CONFIG_VERSION,
    },
    (data) => {
      const next = structuredClone(data);

      for (const [keyPath, value] of Object.entries(changes)) {
        if (value !== undefined) setValueAt(next, keyPath, value);
      }

      return next;
    },
  );
}

/** Set a dot-separated key path, replacing any non-object on the way. */
function setValueAt(
  document: Record<string, unknown>,
  keyPath: string,
  value: unknown,
): void {
  const keys = keyPath.split(".");
  const last = keys.pop() ?? keyPath;
  let parent = document;

  for (const key of keys) {
    const next = parent[key];

    if (isRecord(next)) {
      parent = next;
    } else {
      const created: Record<string, unknown> = {};

      parent[key] = created;
      parent = created;
    }
  }

  parent[last] = value;
}
