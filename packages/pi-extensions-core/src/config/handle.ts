/**
 * One extension's `config.json`, described once: the handle reads, saves,
 * and migrates each scope's file, resolving the location from Pi's agent
 * directory and the project from the handler context.
 */

import { describeErrorSentence } from "../errors.js";
import {
  configFilePath,
  DEFAULT_CONFIG_FILE_FS,
  readConfigFile,
  writeConfigFile,
  type ConfigContext,
  type ConfigFile,
  type ConfigFileFs,
  type ConfigScope,
  type ReadConfigFileOptions,
} from "./file.js";
import { renameConfigKeys, type ConfigKeyRename } from "./keys.js";
import {
  createConfigOutcome,
  type ConfigMigration,
  type ConfigOutcome,
} from "./outcome.js";

/** Everything core needs to know about one extension's `config.json`. */
export interface ConfigFileDescription<S extends ConfigScope> {
  /** The slug, which names the configuration directory in each scope. */
  readonly extension: string;
  /** The display name startup messages name, such as `Theme Sync`. */
  readonly extensionName: string;
  /**
   * Names of files an older release read beside `config.json`, such as
   * `presets.json`. In an untrusted project without `config.json`, the
   * first of these that exists is reported as the skipped project file.
   */
  readonly legacyFileNames?: readonly string[];
  /** Keys read under an old name while the new name is absent. */
  readonly renamedKeys?: readonly ConfigKeyRename[];
  /** The scopes the extension has, such as `["user", "project"]`. */
  readonly scopes: readonly S[];
  /** The `version` this release reads and writes. */
  readonly version: number;
}

/**
 * The operations on one extension's `config.json`. Each takes the handler
 * context, whose `isProjectTrusted()` is asked only when a project file is
 * read or written.
 */
export interface ConfigFileHandle<S extends ConfigScope> {
  /**
   * Read every scope's file. Never throws for a file problem: each is an
   * `invalid` or `untrusted` file carrying its warning.
   */
  readonly load: (ctx: ConfigContext) => Promise<ConfigOutcome<S>>;
  /**
   * Rewrite every file that still uses an old key name under the new
   * names with the current `version`, skipping a project Pi does not
   * trust. A failed write leaves that file unchanged and adds the warning
   * `Could not migrate configuration at <path>: <message>. Left the file unchanged.`;
   * the old names are still read, so the session keeps the values.
   */
  readonly migrateKeys: (ctx: ConfigContext) => Promise<ConfigMigration>;
  /**
   * The path of one scope's file: `<agentDir>/<extension>/config.json` for
   * `user`, where `<agentDir>` is Pi's agent directory (`~/.pi/agent`, or
   * `PI_CODING_AGENT_DIR`), and `<cwd>/.pi/<extension>/config.json` for
   * `project`.
   */
  readonly path: (ctx: Pick<ConfigContext, "cwd">, scope: S) => string;
  /** Read one scope's file, as {@link ConfigFileHandle.load} reads it. */
  readonly read: (ctx: ConfigContext, scope: S) => Promise<ConfigFile>;
  /**
   * Read one scope's file again, apply `update` to its data, and save the
   * result with the current `version` first.
   *
   * `update` receives the data with renamed keys already moved, or `{}`
   * when the file is missing, so a save also migrates renamed keys.
   * Throws, leaving the file untouched, when the scope is a project Pi
   * does not trust, when the file is `invalid` (so a malformed file or one
   * from a newer release is never overwritten), or when the write fails.
   */
  readonly update: (
    ctx: ConfigContext,
    scope: S,
    update: (data: Record<string, unknown>) => Record<string, unknown>,
  ) => Promise<void>;
  /**
   * Atomically write `document` as one scope's file, with renamed keys
   * moved and the current `version` first, whatever the file holds now.
   * For migrating an old layout. Throws, leaving the file untouched, when
   * the scope is a project Pi does not trust or the write fails.
   */
  readonly write: (
    ctx: ConfigContext,
    scope: S,
    document: Record<string, unknown>,
  ) => Promise<void>;
}

/**
 * Build the handle for `description` on the file system `fs`, which core's
 * tests replace with one that fails. Extensions use
 * {@link defineConfigFile}.
 */
export function createConfigFileHandle<S extends ConfigScope>(
  description: ConfigFileDescription<S>,
  fs: ConfigFileFs,
): ConfigFileHandle<S> {
  const { extension, extensionName, scopes, version } = description;
  const renamedKeys = description.renamedKeys ?? [];
  const readOptions: ReadConfigFileOptions = {
    fs,
    legacyFileNames: description.legacyFileNames ?? [],
    renamedKeys,
    version,
  };
  const path = (ctx: Pick<ConfigContext, "cwd">, scope: S): string =>
    configFilePath(extension, scope, ctx.cwd);
  const isTrusted = (ctx: ConfigContext, scope: S): boolean =>
    scope === "user" || ctx.isProjectTrusted();
  const read = (ctx: ConfigContext, scope: S): Promise<ConfigFile> =>
    readConfigFile(
      { path: path(ctx, scope), scope },
      isTrusted(ctx, scope),
      readOptions,
    );
  // A save refuses a project Pi does not trust before touching the file.
  const savablePath = (ctx: ConfigContext, scope: S): string => {
    const target = path(ctx, scope);

    if (!isTrusted(ctx, scope)) {
      throw new Error(
        `The project is not trusted, so ${target} was not saved. Trust the project and try again.`,
      );
    }

    return target;
  };
  const readAll = async (ctx: ConfigContext): Promise<ConfigFile[]> =>
    Promise.all(scopes.map((scope) => read(ctx, scope)));

  return {
    load: async (ctx) => {
      const files = await readAll(ctx);

      return createConfigOutcome(
        extensionName,
        Object.fromEntries(
          files.map((file, index) => [scopes[index], file]),
        ) as Record<S, ConfigFile>,
      );
    },
    migrateKeys: async (ctx) => {
      const migrated: string[] = [];
      const warnings: string[] = [];

      for (const file of await readAll(ctx)) {
        if (file.state !== "loaded" || file.renamedKeys.length === 0) continue;

        try {
          await writeConfigFile(file.path, file.data, version, fs);
          migrated.push(file.path);
        } catch (error) {
          warnings.push(
            `Could not migrate configuration at ${file.path}: ${describeErrorSentence(error)} Left the file unchanged.`,
          );
        }
      }

      return { migrated, warnings };
    },
    path,
    read,
    update: async (ctx, scope, update) => {
      const target = savablePath(ctx, scope);
      const file = await readConfigFile(
        { path: target, scope },
        true,
        readOptions,
      );

      if (file.state === "invalid") {
        throw new Error(
          `${file.path} is invalid (${file.reason}). Fix the file and try again.`,
        );
      }

      await writeConfigFile(
        target,
        update(file.state === "loaded" ? file.data : {}),
        version,
        fs,
      );
    },
    write: async (ctx, scope, document) => {
      await writeConfigFile(
        savablePath(ctx, scope),
        renameConfigKeys(document, renamedKeys).document,
        version,
        fs,
      );
    },
  };
}

/** Describe an extension's `config.json` once and get its operations. */
export function defineConfigFile<S extends ConfigScope>(
  description: ConfigFileDescription<S>,
): ConfigFileHandle<S> {
  return createConfigFileHandle(description, DEFAULT_CONFIG_FILE_FS);
}
