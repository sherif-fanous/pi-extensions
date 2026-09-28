/**
 * Reading and writing one scope's `config.json`: where it lives, Pi's
 * project trust, the `version` key, and renamed keys.
 */

import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import { describeError } from "../errors.js";
import { isNotFoundError } from "../guards.js";
import { writeJsonFile, type AtomicWriteFs } from "./atomic-write.js";
import { parseJsonObject } from "./json.js";
import { renameConfigKeys, type ConfigKeyRename } from "./keys.js";
import {
  malformedConfigWarning,
  unreadableConfigWarning,
  unsupportedConfigVersionWarning,
  untrustedProjectConfigWarning,
} from "./warnings.js";
import {
  CONFIG_DIR_NAME,
  getAgentDir,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/**
 * The file-system calls reading and writing make. Core's tests inject
 * failures.
 */
export interface ConfigFileFs extends AtomicWriteFs {
  readonly access: (path: string) => Promise<void>;
  readonly readFile: (path: string, encoding: "utf8") => Promise<string>;
}

/** Where a configuration file lives. */
export interface ConfigFileLocation {
  readonly path: string;
  readonly scope: ConfigScope;
}

/** What reading a file needs besides its location and project trust. */
export interface ReadConfigFileOptions {
  readonly fs: ConfigFileFs;
  /** Old file names beside `config.json` that an untrusted project reports. */
  readonly legacyFileNames: readonly string[];
  /** Keys read under an old name while the new name is absent. */
  readonly renamedKeys: readonly ConfigKeyRename[];
  /** The `version` this release reads and writes. */
  readonly version: number;
}

/** The part of a handler's context the config handle uses for project trust. */
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

/** The real file system, used unless a core test injects failures. */
export const DEFAULT_CONFIG_FILE_FS: ConfigFileFs = {
  access: (path) => access(path),
  mkdir,
  open,
  readFile: (path, encoding) => readFile(path, encoding),
  rename,
  unlink,
};

/**
 * Path to an extension's configuration file in one scope:
 * `<agentDir>/<extension>/config.json` for `user`, where `<agentDir>` is
 * Pi's `getAgentDir()` (which honors `PI_CODING_AGENT_DIR`), and
 * `<cwd>/.pi/<extension>/config.json` for `project`.
 */
export function configFilePath(
  extension: string,
  scope: ConfigScope,
  cwd: string,
): string {
  const base = scope === "user" ? getAgentDir() : join(cwd, CONFIG_DIR_NAME);

  return join(base, extension, CONFIG_FILE_NAME);
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
 * Read one configuration file.
 *
 * A project file in an untrusted project is not read: it is `untrusted`
 * when it, or else one of `legacyFileNames` beside it, exists, and
 * `missing` otherwise, so an untrusted project without the file stays
 * silent. A file whose `version` is present and differs from `version` is
 * `invalid`. Otherwise `renamedKeys` are applied to the loaded data.
 */
export async function readConfigFile(
  location: ConfigFileLocation,
  trusted: boolean,
  options: ReadConfigFileOptions,
): Promise<ConfigFile> {
  const { fs } = options;
  const { path } = location;

  if (location.scope === "project" && !trusted) {
    const candidates = [
      path,
      ...options.legacyFileNames.map((name) => join(dirname(path), name)),
    ];

    for (const candidate of candidates) {
      if (await mightExist(fs, candidate)) {
        return {
          path: candidate,
          scope: location.scope,
          state: "untrusted",
          warning: untrustedProjectConfigWarning(candidate),
        };
      }
    }

    return { ...location, state: "missing" };
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
    options.renamedKeys,
  );

  return { ...location, data: document, renamedKeys: renamed, state: "loaded" };
}

/**
 * Atomically write `document` to `path` as JSON with `version` as its
 * first key, replacing any `version` the document holds.
 */
export async function writeConfigFile(
  path: string,
  document: Record<string, unknown>,
  version: number,
  fs: AtomicWriteFs,
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

/**
 * Whether a file might exist at `path`. Anything but a missing-file error
 * might hide one, so it counts as present.
 */
async function mightExist(fs: ConfigFileFs, path: string): Promise<boolean> {
  try {
    await fs.access(path);

    return true;
  } catch (error) {
    return !isNotFoundError(error);
  }
}
