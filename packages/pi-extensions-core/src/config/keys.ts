/**
 * Renamed configuration keys: reading a key under its old name and moving
 * it to the new one, so an extension can rename a key without breaking
 * existing files.
 */

import { isRecord } from "../guards.js";

/**
 * One renamed key, as dot-separated paths from the top of the document,
 * such as `{ from: "maxToastsVisible", to: "toast.maxVisible" }`.
 */
export interface ConfigKeyRename {
  readonly from: string;
  readonly to: string;
}

/** Outcome of {@link renameConfigKeys}. */
export interface RenamedConfigKeys {
  /** A copy of the document with every applicable rename applied. */
  readonly document: Record<string, unknown>;
  /** The `from` path of every rename applied, in `renames` order. */
  readonly renamed: readonly string[];
}

/**
 * Move each old key in `document` to its new path, without changing
 * `document` itself.
 *
 * When only the old key is present, its value moves to the new path, and
 * any missing objects on the way are created. When both are present, the
 * new key wins and the old key is dropped. A rename is skipped, leaving
 * the old key in place, when the old key is absent or when a value on the
 * way to the new path is not an object.
 */
export function renameConfigKeys(
  document: Record<string, unknown>,
  renames: readonly ConfigKeyRename[],
): RenamedConfigKeys {
  const copy = structuredClone(document);
  const renamed: string[] = [];

  for (const { from, to } of renames) {
    const source = locate(copy, from, false);

    if (source === undefined || source.parent[source.key] === undefined) {
      continue;
    }

    const target = locate(copy, to, true);

    if (target === undefined) continue;

    if (target.parent[target.key] === undefined) {
      target.parent[target.key] = source.parent[source.key];
    }

    delete source.parent[source.key];
    renamed.push(from);
  }

  return { document: copy, renamed };
}

/**
 * Find the object holding the last segment of a dot-separated `path`.
 *
 * With `create`, missing objects on the way are added. Returns
 * `undefined` when a value on the way is not an object, or is missing and
 * `create` is false.
 */
function locate(
  root: Record<string, unknown>,
  path: string,
  create: boolean,
): { key: string; parent: Record<string, unknown> } | undefined {
  const segments = path.split(".");
  const key = segments.pop() ?? path;
  let parent = root;

  for (const segment of segments) {
    if (parent[segment] === undefined && create) parent[segment] = {};

    const next = parent[segment];

    if (!isRecord(next)) return undefined;

    parent = next;
  }

  return { key, parent };
}
