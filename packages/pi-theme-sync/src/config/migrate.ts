/**
 * Moves the old `settings.json` and `theme-sync.json` files to `config.json`
 * and rewrites renamed keys at session start, then loads the configuration.
 */

import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import type { LoadedRuntimeConfig } from "../types.js";
import {
  CONFIG_EXTENSION,
  CONFIG_VERSION,
  loadConfig,
  RENAMED_CONFIG_KEYS,
  type LoadConfigContext,
} from "./load.js";
import { configPath } from "./save.js";
import {
  describeError,
  describeErrorSentence,
  extensionConfigPath,
  isNotFoundError,
  migrateRenamedConfigKeys,
  parseJsonObject,
  projectConfigPath,
  renameConfigKeys,
  writeConfigFile,
  type AtomicWriteFs,
  type ConfigContext,
  type ConfigFileFs,
  type ConfigScope,
} from "@sherif-fanous/pi-extensions-core";

/** Files one session start migrated, and the warnings for those it could not. */
export interface ConfigMigration {
  /** Paths of the `config.json` files written. */
  readonly migrated: readonly string[];
  readonly warnings: readonly string[];
}

/** Where migration reads and writes; tests pass their own. */
export interface MigrateConfigOptions {
  readonly agentDir?: string;
  readonly fs?: MigrationFs;
}

/** The file-system calls migration makes. Tests inject failures. */
export interface MigrationFs extends ConfigFileFs {
  readonly atomicWriteFs?: AtomicWriteFs;
  readonly unlink: (path: string) => Promise<void>;
}

/** The configuration a session starts with, after migration. */
export interface StartupConfig extends ConfigMigration {
  readonly config: LoadedRuntimeConfig;
}

const defaultFs: MigrationFs = {
  access: (filePath) => access(filePath),
  readFile: (filePath, encoding) => readFile(filePath, encoding),
  unlink: (filePath) => unlink(filePath),
};

/**
 * Migrate old files and renamed keys, then load the configuration.
 * Migration warnings come before the load's file and value problems.
 */
export async function loadStartupConfig(
  ctx: LoadConfigContext,
  options: MigrateConfigOptions = {},
): Promise<StartupConfig> {
  const layout = await migrateConfigLayout(ctx, options);
  const config = await loadConfig(ctx, options);
  const keys = await migrateRenamedConfigKeys(
    [config.files.user, config.files.project],
    CONFIG_VERSION,
    options.fs?.atomicWriteFs,
  );

  return {
    config,
    migrated: [...layout.migrated, ...keys.migrated],
    warnings: [...layout.warnings, ...keys.warnings],
  };
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
  options: MigrateConfigOptions = {},
): Promise<ConfigMigration> {
  const migrated: string[] = [];
  const warnings: string[] = [];

  for (const scope of ["user", "project"] as const) {
    if (scope === "project" && !ctx.isProjectTrusted()) continue;

    const outcome = await migrateScope(scope, ctx, options);

    if (outcome.migrated !== undefined) migrated.push(outcome.migrated);
    warnings.push(...outcome.warnings);
  }

  return { migrated, warnings };
}

/** The old files of a scope, in the order the old release read them. */
export function oldConfigPaths(
  scope: ConfigScope,
  ctx: Pick<ConfigContext, "cwd">,
  agentDir?: string,
): readonly [settings: string, legacy: string] {
  const settings =
    scope === "user"
      ? extensionConfigPath({
          agentDir,
          extension: CONFIG_EXTENSION,
          file: "settings.json",
        })
      : projectConfigPath({
          cwd: ctx.cwd,
          extension: CONFIG_EXTENSION,
          file: "settings.json",
        });

  return [
    settings,
    path.join(path.dirname(path.dirname(settings)), `${CONFIG_EXTENSION}.json`),
  ];
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
  options: MigrateConfigOptions,
): Promise<{ migrated?: string; warnings: string[] }> {
  const fs = options.fs ?? defaultFs;
  const target = configPath(scope, ctx, options.agentDir);

  if (await exists(fs, target)) return { warnings: [] };

  for (const source of oldConfigPaths(scope, ctx, options.agentDir)) {
    let text: string;

    try {
      text = await fs.readFile(source, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) continue;

      return failed(source, describeErrorSentence(error));
    }

    const parsed = parseJsonObject(text);

    if (!parsed.ok) {
      return failed(
        source,
        parsed.reason === "invalid-json"
          ? `The file is not valid JSON (${describeError(parsed.error)}).`
          : "The file is not a JSON object.",
      );
    }

    const { document } = renameConfigKeys(parsed.value, RENAMED_CONFIG_KEYS);

    try {
      await writeConfigFile(target, document, CONFIG_VERSION, fs.atomicWriteFs);
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
