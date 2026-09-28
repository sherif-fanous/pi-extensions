/**
 * Migrates eligible version 1 scope files into one version 2 configuration.
 * Reads every input before writing, then cleans up sidecars after the commit.
 */
import { readFile, unlink } from "node:fs/promises";

import { EXTENSION_NAME } from "../extension-name.js";
import type { ConfigDocument, PresetScope } from "../types.js";
import {
  getGlobalConfigPath,
  getGlobalPolicyPath,
  getGlobalPresetsPath,
  getProjectConfigPath,
  getProjectPresetsPath,
} from "./paths.js";
import {
  describeError,
  isNotFoundError,
  isRecord,
  writeJsonFile,
  type AtomicWriteFs,
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
  readonly attempted: boolean;
  readonly migrated: boolean;
  readonly warnings: string[];
}

/**
 * Describe attempted migrations for startup: an info line naming the
 * scopes that migrated, if any, and every migration warning.
 */
export function describeMigration(outcomes: readonly MigrationOutcome[]): {
  readonly info?: string;
  readonly warnings: string[];
} {
  const migrated = outcomes
    .filter((outcome) => outcome.migrated)
    .map((outcome) => outcome.scope);
  const warnings = outcomes.flatMap((outcome) => outcome.warnings);

  return migrated.length > 0
    ? {
        info: `${EXTENSION_NAME} migrated ${migrated.join(" and ")} configuration to config.json.`,
        warnings,
      }
    : { warnings };
}

/** Migrate both independent scopes and return their outcomes. */
export async function migrateAll(
  cwd: string,
  agentDir?: string,
  fs: MigrationFs = defaultFs,
): Promise<MigrationOutcome[]> {
  return Promise.all([
    migrateScope("user", cwd, agentDir, fs),
    migrateScope("project", cwd, agentDir, fs),
  ]);
}

/** Migrate one scope, leaving all source files intact when validation fails. */
export async function migrateScope(
  scope: PresetScope,
  cwd: string,
  agentDir?: string,
  fs: MigrationFs = defaultFs,
): Promise<MigrationOutcome> {
  const configPath =
    scope === "user"
      ? getGlobalConfigPath(agentDir)
      : getProjectConfigPath(cwd);
  const sidecars =
    scope === "user"
      ? [getGlobalPresetsPath(agentDir), getGlobalPolicyPath(agentDir)]
      : [getProjectPresetsPath(cwd)];
  const configRead = await readJson(fs, configPath);

  if (configRead.exists && configRead.error && scope === "user") {
    return failed(scope, configPath, configRead.error);
  }

  if (
    configRead.exists &&
    (scope === "project" || isVersion2(configRead.value))
  ) {
    return { scope, attempted: false, migrated: false, warnings: [] };
  }

  if (configRead.exists && !isVersion1(configRead.value)) {
    return { scope, attempted: false, migrated: false, warnings: [] };
  }

  const legacyPaths = scope === "user" ? [configPath, ...sidecars] : sidecars;
  const existing: Array<{ path: string; value: Record<string, unknown> }> = [];

  for (const path of legacyPaths) {
    const result = path === configPath ? configRead : await readJson(fs, path);

    if (!result.exists) continue;

    if (result.error) {
      return failed(scope, path, result.error);
    }

    if (!isRecord(result.value) || result.value.version !== 1) {
      return failed(scope, path, `expected a version 1 JSON object`);
    }

    existing.push({ path, value: result.value });
  }

  if (existing.length === 0)
    return { scope, attempted: false, migrated: false, warnings: [] };

  const document: ConfigDocument = { version: 2 };
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
        `"showInactiveStatus" must be a boolean`,
      );
    document.showInactiveStatus = config.showInactiveStatus;
  }

  if (presets) {
    if (!Array.isArray(presets.presets))
      return failed(
        scope,
        getLegacyPresetPath(scope, cwd, agentDir),
        `"presets" must be an array`,
      );
    document.presets = presets.presets;
  }

  if (policy) {
    if (!Array.isArray(policy.rules))
      return failed(
        scope,
        getGlobalPolicyPath(agentDir),
        `"rules" must be an array`,
      );
    document.policy = { rules: policy.rules };
  }

  try {
    await writeJsonFile(configPath, document, fs.atomicWriteFs);
  } catch (error) {
    return failed(
      scope,
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

  return { scope, attempted: true, migrated: true, warnings };
}

function failed(
  scope: PresetScope,
  path: string,
  reason: string,
): MigrationOutcome {
  return {
    scope,
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
    ? getGlobalPresetsPath(agentDir)
    : getProjectPresetsPath(cwd);
}

function isVersion1(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.version === 1;
}

function isVersion2(value: unknown): boolean {
  return isRecord(value) && value.version === 2;
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
