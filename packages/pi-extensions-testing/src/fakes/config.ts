/**
 * Doubles for configuration tests: a context whose project trust the test
 * sets, and real temporary agent and project directories.
 */

import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** The part of an extension context that project trust checks read. */
export interface ProjectTrustContext {
  readonly cwd: string;
  readonly isProjectTrusted: () => boolean;
}

/**
 * A fresh temporary directory holding an agent directory and a project
 * directory, with file helpers that create parent directories as needed.
 */
export interface TempConfigDirs {
  /** `<root>/agent`, for `agentDir` options. Not created until written to. */
  readonly agentDir: string;
  /** Delete the whole temporary directory. */
  readonly cleanup: () => Promise<void>;
  /** `<root>/project`, for `cwd`. Not created until written to. */
  readonly cwd: string;
  /** Whether a file or directory exists at `path`. */
  readonly exists: (path: string) => Promise<boolean>;
  /** Parse the JSON file at `path`. */
  readonly readJson: (path: string) => Promise<unknown>;
  /** The temporary directory itself. */
  readonly root: string;
  /** Write `value` to `path` as JSON indented by two spaces. */
  readonly writeJson: (path: string, value: unknown) => Promise<void>;
  /** Write `text` to `path` as is, such as malformed JSON. */
  readonly writeText: (path: string, text: string) => Promise<void>;
}

/** A context for `cwd` whose `isProjectTrusted()` returns `trusted`. */
export function createProjectTrustContext(
  cwd: string,
  trusted: boolean,
): ProjectTrustContext {
  return { cwd, isProjectTrusted: () => trusted };
}

/**
 * Create a temporary directory under the OS temp directory for one test.
 * Call `cleanup` in `afterEach`.
 */
export async function createTempConfigDirs(): Promise<TempConfigDirs> {
  const root = await mkdtemp(join(tmpdir(), "pi-extensions-config-"));
  const writeText = async (path: string, text: string): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  };

  return {
    agentDir: join(root, "agent"),
    cleanup: () => rm(root, { force: true, recursive: true }),
    cwd: join(root, "project"),
    exists: (path) =>
      access(path).then(
        () => true,
        () => false,
      ),
    readJson: async (path): Promise<unknown> =>
      JSON.parse(await readFile(path, "utf8")) as unknown,
    root,
    writeJson: (path, value) =>
      writeText(path, `${JSON.stringify(value, null, 2)}\n`),
    writeText,
  };
}
