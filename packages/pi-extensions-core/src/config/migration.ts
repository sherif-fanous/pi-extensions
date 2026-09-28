/**
 * Startup migration of renamed configuration keys, and the one info
 * message that reports every migrated file.
 */

import { describeErrorSentence } from "../errors.js";
import type { AtomicWriteFs } from "./atomic-write.js";
import { writeConfigFile, type ConfigFile } from "./file.js";

/** Outcome of {@link migrateRenamedConfigKeys}. */
export interface ConfigKeyMigration {
  /** Paths of the files rewritten, in the order given. */
  readonly migrated: readonly string[];
  /** One warning per file that could not be rewritten. */
  readonly warnings: readonly string[];
}

/**
 * The info message for a startup migration:
 * `<extensionName> migrated its configuration to <path>.`, with two paths
 * joined by `and` and more as `a, b, and c`.
 */
export function configMigratedMessage(
  extensionName: string,
  paths: readonly [string, ...string[]],
): string {
  const joined =
    paths.length <= 2
      ? paths.join(" and ")
      : `${paths.slice(0, -1).join(", ")}, and ${paths.at(-1) ?? ""}`;

  return `${extensionName} migrated its configuration to ${joined}.`;
}

/**
 * Rewrite every `loaded` file whose `renamedKeys` is not empty with its
 * data, which already has the new key names, stamped with `version`.
 *
 * Other files are left alone. A failed write leaves that file unchanged
 * and adds the warning
 * `Could not migrate configuration at <path>: <message>. Left the file unchanged.`;
 * the renamed keys still apply for the session, since they are read under
 * their old names.
 */
export async function migrateRenamedConfigKeys(
  files: readonly ConfigFile[],
  version: number,
  fs?: AtomicWriteFs,
): Promise<ConfigKeyMigration> {
  const migrated: string[] = [];
  const warnings: string[] = [];

  for (const file of files) {
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
}
