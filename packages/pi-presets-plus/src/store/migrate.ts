/**
 * Migrates eligible version 1 scope files into one version 2 configuration.
 * Reads every input before writing, then cleans up sidecars after the commit.
 * A project Pi does not trust is never migrated.
 */
import { readFile, unlink } from "node:fs/promises";

import { EXTENSION_NAME } from "../extension-name.js";
import type { ConfigDocument, PresetScope } from "../types.js";
import { CONFIG_VERSION } from "./config.js";
import {
  getConfigPath,
  getProjectPresetsPath,
  getUserPolicyPath,
  getUserPresetsPath,
} from "./paths.js";
import {
  configMigratedMessage,
  describeError,
  isNotFoundError,
  isRecord,
  writeConfigFile,
  type AtomicWriteFs,
  type ConfigContext,
} from "@sherif-fanous/pi-extensions-core";

/** File-system seam for migration tests. */
export interface MigrationFs {
  readonly readFile: typeof readFile;
  readonly unlink: typeof unlink;
  readonly atomicWriteFs?: AtomicWriteFs;
}

const defaultFs: MigrationFs = { readFile, unlink };

/** Structured result for one attempted scope migration. */
export interface MigrationOutcome {
  readonly scope: PresetScope;
  /** The scope's `config.json`, which a migration writes. */
  readonly path: string;
  readonly attempted: boolean;
  readonly migrated: boolean;
  readonly warnings: string[];
}

/**
 * Describe attempted migrations for startup: one info line naming the
 * files written, if any, and every migration warning.
 */
export function describeMigration(outcomes: readonly MigrationOutcome[]): {
  readonly info?: string;
  readonly warnings: string[];
} {
  const [first, ...rest] = outcomes
    .filter((outcome) => outcome.migrated)
    .map((outcome) => outcome.path);
  const warnings = outcomes.flatMap((outcome) => outcome.warnings);

  return first === undefined
    ? { warnings }
    : {
        info: configMigratedMessage(EXTENSION_NAME, [first, ...rest]),
        warnings,
      };
}

/**
 * Migrate the user scope, and the project scope while Pi trusts the
 * project, and return their outcomes. The loader reports a legacy project
 * file left behind in an untrusted project.
 */
export async function migrateAll(
  ctx: ConfigContext,
  agentDir?: string,
  fs: MigrationFs = defaultFs,
): Promise<MigrationOutcome[]> {
  const scopes: PresetScope[] = ctx.isProjectTrusted()
    ? ["user", "project"]
    : ["user"];

  return Promise.all(
    scopes.map((scope) => migrateScope(scope, ctx.cwd, agentDir, fs)),
  );
}

/** Migrate one scope, leaving all source files intact when validation fails. */
export async function migrateScope(
  scope: PresetScope,
  cwd: string,
  agentDir?: string,
  fs: MigrationFs = defaultFs,
): Promise<MigrationOutcome> {
  const configPath = getConfigPath(scope, cwd, agentDir);
  const sidecars =
    scope === "user"
      ? [getUserPresetsPath(agentDir), getUserPolicyPath(agentDir)]
      : [getProjectPresetsPath(cwd)];
  const configRead = await readJson(fs, configPath);
  const skipped = {
    scope,
    path: configPath,
    attempted: false,
    migrated: false,
    warnings: [],
  };

  if (configRead.exists && configRead.error && scope === "user") {
    return failed(scope, configPath, configPath, configRead.error);
  }

  // A version 2 file, or one without `version`, which reads as version 2,
  // is never overwritten. Only a user `config.json` can be version 1.
  if (
    configRead.exists &&
    (scope === "project" || !isVersion1(configRead.value))
  ) {
    return skipped;
  }

  const legacyPaths = scope === "user" ? [configPath, ...sidecars] : sidecars;
  const existing: Array<{ path: string; value: Record<string, unknown> }> = [];

  for (const path of legacyPaths) {
    const result = path === configPath ? configRead : await readJson(fs, path);

    if (!result.exists) continue;

    if (result.error) {
      return failed(scope, configPath, path, result.error);
    }

    if (!isVersion1(result.value)) {
      return failed(
        scope,
        configPath,
        path,
        `expected a version 1 JSON object`,
      );
    }

    existing.push({ path, value: result.value });
  }

  if (existing.length === 0) return skipped;

  const document: ConfigDocument = {};
  const config = existing.find((entry) => entry.path === configPath)?.value;
  const presets = existing.find(
    (entry) => entry.path !== configPath && entry.path.endsWith("presets.json"),
  )?.value;
  const policy = existing.find((entry) =>
    entry.path.endsWith("policy.json"),
  )?.value;

  if (config?.showInactiveStatus !== undefined) {
    if (typeof config.showInactiveStatus !== "boolean")
      return failed(
        scope,
        configPath,
        configPath,
        `"showInactiveStatus" must be a boolean`,
      );
    document.showInactiveStatus = config.showInactiveStatus;
  }

  if (presets) {
    if (!Array.isArray(presets.presets))
      return failed(
        scope,
        configPath,
        getLegacyPresetPath(scope, cwd, agentDir),
        `"presets" must be an array`,
      );
    document.presets = presets.presets;
  }

  if (policy) {
    if (!Array.isArray(policy.rules))
      return failed(
        scope,
        configPath,
        getUserPolicyPath(agentDir),
        `"rules" must be an array`,
      );
    document.policy = { rules: policy.rules };
  }

  try {
    await writeConfigFile(
      configPath,
      document,
      CONFIG_VERSION,
      fs.atomicWriteFs,
    );
  } catch (error) {
    return failed(
      scope,
      configPath,
      configPath,
      `could not write the version 2 configuration: ${describeError(error)}`,
    );
  }

  const warnings: string[] = [];

  for (const path of sidecars) {
    try {
      await fs.unlink(path);
    } catch (error) {
      if (!isNotFoundError(error))
        warnings.push(
          `Created ${configPath} but could not remove ${path}: ${describeError(error)}. Delete it by hand.`,
        );
    }
  }

  return { scope, path: configPath, attempted: true, migrated: true, warnings };
}

/** The outcome of a scope whose migration failed because of `path`. */
function failed(
  scope: PresetScope,
  configPath: string,
  path: string,
  reason: string,
): MigrationOutcome {
  return {
    scope,
    path: configPath,
    attempted: true,
    migrated: false,
    warnings: [
      `Migration failed for ${path}: ${reason}. See the migration guidance in the README.`,
    ],
  };
}

function getLegacyPresetPath(
  scope: PresetScope,
  cwd: string,
  agentDir?: string,
): string {
  return scope === "user"
    ? getUserPresetsPath(agentDir)
    : getProjectPresetsPath(cwd);
}

function isVersion1(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.version === 1;
}

async function readJson(
  fs: MigrationFs,
  path: string,
): Promise<{ exists: boolean; value?: unknown; error?: string }> {
  let raw: string;

  try {
    raw = await fs.readFile(path, "utf-8");
  } catch (error) {
    if (isNotFoundError(error)) return { exists: false };

    return {
      exists: true,
      error: `could not read ${path}: ${describeError(error)}`,
    };
  }

  try {
    return { exists: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      exists: true,
      error: `contains invalid JSON: ${describeError(error)}`,
    };
  }
}
