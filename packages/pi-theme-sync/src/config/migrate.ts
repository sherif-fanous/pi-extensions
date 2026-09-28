/**
 * Moves the old `settings.json` and `theme-sync.json` files to `config.json`
 * and rewrites renamed keys at session start, then loads the configuration.
 */

import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import type { LoadedRuntimeConfig } from "../types.js";
import {
  loadConfig,
  THEME_SYNC_CONFIG,
  type LoadConfigContext,
} from "./load.js";
import {
  describeError,
  describeErrorSentence,
  isNotFoundError,
  isRecord,
  type ConfigContext,
  type ConfigMigration,
  type ConfigScope,
} from "@sherif-fanous/pi-extensions-core";

/**
 * The file-system calls migration makes besides writing `config.json`.
 * Tests inject failures.
 */
export interface MigrationFs {
  readonly access: (path: string) => Promise<void>;
  readonly readFile: (path: string, encoding: "utf8") => Promise<string>;
  readonly unlink: (path: string) => Promise<void>;
}

const defaultFs: MigrationFs = {
  access: (filePath) => access(filePath),
  readFile: (filePath, encoding) => readFile(filePath, encoding),
  unlink: (filePath) => unlink(filePath),
};

/**
 * Migrate old files and renamed keys, then load the configuration. The
 * outcome lists the old layout's migration before the renamed keys'.
 */
export async function loadStartupConfig(
  ctx: LoadConfigContext,
): Promise<LoadedRuntimeConfig> {
  const layout = await migrateConfigLayout(ctx);
  const keys = await THEME_SYNC_CONFIG.migrateKeys(ctx);
  const config = await loadConfig(ctx);

  return { ...config, outcome: config.outcome.withMigrations(layout, keys) };
}

/**
 * Move each scope's old file to `config.json`, with renamed keys moved and
 * `version` stamped, then delete the old file.
 *
 * The old file is `theme-sync/settings.json`, or `theme-sync.json` one
 * directory up when that is missing, as the release before `config.json`
 * read them. A scope whose `config.json` exists, or a project Pi does not
 * trust, is left alone. An old file that cannot be read, parsed, or
 * written leaves every file unchanged and adds a warning.
 */
export async function migrateConfigLayout(
  ctx: ConfigContext,
  fs: MigrationFs = defaultFs,
): Promise<ConfigMigration> {
  const migrated: string[] = [];
  const warnings: string[] = [];

  for (const scope of ["user", "project"] as const) {
    if (scope === "project" && !ctx.isProjectTrusted()) continue;

    const outcome = await migrateScope(scope, ctx, fs);

    if (outcome.migrated !== undefined) migrated.push(outcome.migrated);
    warnings.push(...outcome.warnings);
  }

  return { migrated, warnings };
}

async function exists(fs: MigrationFs, filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);

    return true;
  } catch (error) {
    // Anything but a missing file might hide one, so treat it as present.
    return !isNotFoundError(error);
  }
}

function failed(
  source: string,
  message: string,
): { migrated?: string; warnings: string[] } {
  return {
    warnings: [
      `Could not migrate configuration at ${source}: ${message} Ignored the file.`,
    ],
  };
}

async function migrateScope(
  scope: ConfigScope,
  ctx: ConfigContext,
  fs: MigrationFs,
): Promise<{ migrated?: string; warnings: string[] }> {
  const target = THEME_SYNC_CONFIG.path(ctx, scope);

  if (await exists(fs, target)) return { warnings: [] };

  for (const source of oldConfigPaths(target)) {
    let text: string;

    try {
      text = await fs.readFile(source, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) continue;

      return failed(source, describeErrorSentence(error));
    }

    let document: unknown;

    try {
      document = JSON.parse(text);
    } catch (error) {
      return failed(
        source,
        `The file is not valid JSON (${describeError(error)}).`,
      );
    }

    if (!isRecord(document)) {
      return failed(source, "The file is not a JSON object.");
    }

    try {
      await THEME_SYNC_CONFIG.write(ctx, scope, document);
    } catch (error) {
      return failed(source, describeErrorSentence(error));
    }

    try {
      await fs.unlink(source);
    } catch (error) {
      if (!isNotFoundError(error)) {
        return {
          migrated: target,
          warnings: [
            `Created ${target} but could not remove ${source}: ${describeErrorSentence(error)} Delete it by hand.`,
          ],
        };
      }
    }

    return { migrated: target, warnings: [] };
  }

  return { warnings: [] };
}

/**
 * The old files beside a scope's `config.json`, in the order the old
 * release read them: `settings.json` in the same directory, then
 * `theme-sync.json` one directory up.
 */
function oldConfigPaths(
  configPath: string,
): readonly [settings: string, legacy: string] {
  const directory = path.dirname(configPath);

  return [
    path.join(directory, "settings.json"),
    path.join(path.dirname(directory), `${path.basename(directory)}.json`),
  ];
}
