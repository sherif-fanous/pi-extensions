/**
 * Reading and saving an extension's `config.json` in each scope: Pi's
 * project trust, the `version` key, renamed keys, and the state of each
 * file for warnings and status reports.
 */

import { access, readFile } from "node:fs/promises";

import { describeError } from "../errors.js";
import { isNotFoundError } from "../guards.js";
import { writeJsonFile, type AtomicWriteFs } from "./atomic-write.js";
import { parseJsonObject } from "./json.js";
import { renameConfigKeys, type ConfigKeyRename } from "./keys.js";
import { extensionConfigPath, projectConfigPath } from "./paths.js";
import {
  malformedConfigWarning,
  unreadableConfigWarning,
  unsupportedConfigVersionWarning,
  untrustedProjectConfigWarning,
} from "./warnings.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** The file-system calls the loader makes. Tests inject failures. */
export interface ConfigFileFs {
  readonly access: (path: string) => Promise<void>;
  readonly readFile: (path: string, encoding: "utf8") => Promise<string>;
}

/** Where a configuration file lives. */
export interface ConfigFileLocation {
  readonly path: string;
  readonly scope: ConfigScope;
}

/** Options for {@link loadConfigFiles}. */
export interface LoadConfigFilesOptions<S extends ConfigScope> {
  /** Pi's agent directory. Defaults to `getAgentDir()`; tests pass their own. */
  readonly agentDir?: string;
  /** The extension's slug, which names its configuration directory. */
  readonly extension: string;
  readonly fs?: ConfigFileFs;
  /** Keys read under an old name while the new name is absent. */
  readonly renamedKeys?: readonly ConfigKeyRename[];
  /** The scopes the extension has, such as `["user", "project"]`. */
  readonly scopes: readonly S[];
  /** The `version` this release reads and writes. */
  readonly version: number;
}

/** Options for {@link readConfigFile} and {@link updateConfigFile}. */
export interface ReadConfigFileOptions extends ConfigFileLocation {
  readonly fs?: ConfigFileFs;
  /** Keys read under an old name while the new name is absent. */
  readonly renamedKeys?: readonly ConfigKeyRename[];
  /**
   * Whether Pi trusts the project, from `ctx.isProjectTrusted()`. Only a
   * project file consults it.
   */
  readonly trusted: boolean;
  /** The `version` this release reads and writes. */
  readonly version: number;
}

/** The part of a handler's context the loader uses for project trust. */
export type ConfigContext = Pick<ExtensionContext, "cwd" | "isProjectTrusted">;

/**
 * One scope's configuration file and what reading it found.
 *
 * - `loaded`: the file is a JSON object with a supported `version`.
 *   `data` has every renamed key moved to its new name, and
 *   `renamedKeys` lists the old names found, so a non-empty list means
 *   the file still needs migrating.
 * - `missing`: there is no file, which means defaults and no warning.
 * - `invalid`: the file could not be read, is not a JSON object, or has an
 *   unsupported `version`. `reason` is a short lowercase phrase for the
 *   status block; `warning` is the sentence to show once.
 * - `untrusted`: a project file exists but Pi does not trust the project,
 *   so it was not read.
 */
export type ConfigFile =
  | (ConfigFileLocation & {
      readonly data: Record<string, unknown>;
      readonly renamedKeys: readonly string[];
      readonly state: "loaded";
    })
  | (ConfigFileLocation & {
      readonly reason: string;
      readonly state: "invalid";
      readonly warning: string;
    })
  | (ConfigFileLocation & {
      readonly state: "missing";
    })
  | (ConfigFileLocation & {
      readonly state: "untrusted";
      readonly warning: string;
    });

/** The two places a configuration file can live, named as Pi names them. */
export type ConfigScope = "project" | "user";

/** The file name every extension's configuration uses. */
const CONFIG_FILE_NAME = "config.json";

const defaultFs: ConfigFileFs = {
  access: (path) => access(path),
  readFile: (path, encoding) => readFile(path, encoding),
};

/**
 * Path to an extension's configuration file in one scope:
 * `<agentDir>/<extension>/config.json` for `user` and
 * `<cwd>/.pi/<extension>/config.json` for `project`.
 */
export function configFilePath(
  scope: ConfigScope,
  {
    agentDir,
    cwd,
    extension,
  }: { agentDir?: string; cwd: string; extension: string },
): string {
  return scope === "user"
    ? extensionConfigPath({ agentDir, extension, file: CONFIG_FILE_NAME })
    : projectConfigPath({ cwd, extension, file: CONFIG_FILE_NAME });
}

/** The warnings of every file that has one, in the order given. */
export function configFileWarnings(files: readonly ConfigFile[]): string[] {
  return files.flatMap((file) =>
    file.state === "invalid" || file.state === "untrusted"
      ? [file.warning]
      : [],
  );
}

/** The label users see for a scope: `User` or `Project`, as Pi writes them. */
export function configScopeLabel(scope: ConfigScope): "Project" | "User" {
  return scope === "user" ? "User" : "Project";
}

/**
 * Read an extension's configuration file in each of `scopes`, checking
 * project trust through `ctx.isProjectTrusted()` when it reads the project
 * scope.
 *
 * Returns one {@link ConfigFile} per scope and never throws for a file
 * problem: each problem is an `invalid` or `untrusted` state carrying its
 * warning.
 */
export async function loadConfigFiles<S extends ConfigScope>(
  ctx: ConfigContext,
  options: LoadConfigFilesOptions<S>,
): Promise<Record<S, ConfigFile>> {
  const entries = await Promise.all(
    options.scopes.map(
      async (scope) =>
        [
          scope,
          await readConfigFile({
            fs: options.fs,
            path: configFilePath(scope, {
              agentDir: options.agentDir,
              cwd: ctx.cwd,
              extension: options.extension,
            }),
            renamedKeys: options.renamedKeys,
            scope,
            trusted: scope === "user" || ctx.isProjectTrusted(),
            version: options.version,
          }),
        ] as const,
    ),
  );

  return Object.fromEntries(entries) as Record<S, ConfigFile>;
}

/**
 * Read one configuration file.
 *
 * A project file in an untrusted project is not read: it is `untrusted`
 * when it exists and `missing` otherwise, so an untrusted project without
 * the file stays silent. A file whose `version` is present and differs
 * from `version` is `invalid`. Otherwise `renamedKeys` are applied to the
 * loaded data.
 */
export async function readConfigFile(
  options: ReadConfigFileOptions,
): Promise<ConfigFile> {
  const { fs = defaultFs, path, scope } = options;
  const location = { path, scope };

  if (scope === "project" && !options.trusted) {
    try {
      await fs.access(path);
    } catch (error) {
      if (isNotFoundError(error)) return { ...location, state: "missing" };
    }

    return {
      ...location,
      state: "untrusted",
      warning: untrustedProjectConfigWarning(path),
    };
  }

  let text: string;

  try {
    text = await fs.readFile(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return { ...location, state: "missing" };

    return {
      ...location,
      reason: `unreadable: ${describeReason(error)}`,
      state: "invalid",
      warning: unreadableConfigWarning(path, error),
    };
  }

  const parsed = parseJsonObject(text);

  if (!parsed.ok) {
    return {
      ...location,
      reason:
        parsed.reason === "invalid-json"
          ? `not valid JSON: ${describeReason(parsed.error)}`
          : "not a JSON object",
      state: "invalid",
      warning: malformedConfigWarning(path, parsed),
    };
  }

  const found = parsed.value.version;

  if (found !== undefined && found !== options.version) {
    return {
      ...location,
      reason: `unsupported version ${JSON.stringify(found)}`,
      state: "invalid",
      warning: unsupportedConfigVersionWarning(path, found, options.version),
    };
  }

  const { document, renamed } = renameConfigKeys(
    parsed.value,
    options.renamedKeys ?? [],
  );

  return { ...location, data: document, renamedKeys: renamed, state: "loaded" };
}

/**
 * Read one configuration file again, apply `update` to its data, and save
 * the result with the current `version`.
 *
 * `update` receives the file's data with renamed keys already moved, or
 * `{}` when the file is missing, so a save also migrates renamed keys.
 * Throws, leaving the file untouched, when the scope is a project Pi does
 * not trust, when the file is `invalid` (so a malformed file or one from a
 * newer release is never overwritten), or when the write fails.
 */
export async function updateConfigFile(
  options: ReadConfigFileOptions & { readonly atomicWriteFs?: AtomicWriteFs },
  update: (data: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  if (options.scope === "project" && !options.trusted) {
    throw new Error(
      `The project is not trusted, so ${options.path} was not saved. Trust the project and try again.`,
    );
  }

  const file = await readConfigFile(options);

  if (file.state === "invalid") {
    throw new Error(
      `${file.path} is invalid (${file.reason}). Fix the file and try again.`,
    );
  }

  await writeConfigFile(
    file.path,
    update(file.state === "loaded" ? file.data : {}),
    options.version,
    options.atomicWriteFs,
  );
}

/**
 * Atomically write `document` to `path` as JSON with `version` as its
 * first key, replacing any `version` the document holds.
 */
export async function writeConfigFile(
  path: string,
  document: Record<string, unknown>,
  version: number,
  fs?: AtomicWriteFs,
): Promise<void> {
  // The first object puts `version` first; the last replaces the document's.
  await writeJsonFile(
    path,
    Object.assign({ version }, document, { version }),
    fs,
  );
}

/**
 * Describe a thrown value for the middle of a status line, without a
 * final full stop.
 */
function describeReason(error: unknown): string {
  return describeError(error).trim().replace(/\.$/u, "");
}
