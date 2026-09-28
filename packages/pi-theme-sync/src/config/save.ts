/** Saves the overlay's changed settings to the User or Project `config.json`. */

import type { EditableConfigChanges } from "../types.js";
import { THEME_SYNC_CONFIG } from "./load.js";
import {
  isRecord,
  type ConfigContext,
  type ConfigScope,
} from "@sherif-fanous/pi-extensions-core";

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
): Promise<void> {
  if (Object.keys(changes).length === 0) return;

  await THEME_SYNC_CONFIG.update(ctx, scope, (data) => {
    const next = structuredClone(data);

    for (const [keyPath, value] of Object.entries(changes)) {
      if (value !== undefined) setValueAt(next, keyPath, value);
    }

    return next;
  });
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
