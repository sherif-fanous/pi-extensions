/**
 * Migrates eligible version 1 scope files into one version 2 configuration.
 * Reads every input before writing, then cleans up sidecars after the commit.
 * A project Pi does not trust is never migrated.
 */
import { readFile, unlink } from "node:fs/promises";

import type { ConfigDocument, PresetScope } from "../types.js";
import { PRESETS_PLUS_CONFIG } from "./config.js";
import { getLegacyPresetsPath, getUserPolicyPath } from "./paths.js";
import {
  describeError,
  isNotFoundError,
  isRecord,
  type ConfigContext,
  type ConfigMigration,
} from "@sherif-fanous/pi-extensions-core";

/**
 * The file-system calls migration makes besides writing `config.json`.
 * Tests inject failures.
 */
export interface MigrationFs {
  readonly readFile: typeof readFile;
  readonly unlink: typeof unlink;
}

const defaultFs: MigrationFs = { readFile, unlink };

/**
 * Migrate the user scope, and the project scope while Pi trusts the
 * project, User first. The loader reports a legacy project file left
 * behind in an untrusted project.
 */
export async function migrateAll(
  ctx: ConfigContext,
  fs: MigrationFs = defaultFs,
): Promise<ConfigMigration> {
  const scopes: PresetScope[] = ctx.isProjectTrusted()
    ? ["user", "project"]
    : ["user"];
  const outcomes = await Promise.all(
    scopes.map((scope) => migrateScope(scope, ctx, fs)),
  );

  return {
    migrated: outcomes.flatMap((outcome) => outcome.migrated),
    warnings: outcomes.flatMap((outcome) => outcome.warnings),
  };
}

/** Migrate one scope, leaving all source files intact when validation fails. */
export async function migrateScope(
  scope: PresetScope,
  ctx: ConfigContext,
  fs: MigrationFs = defaultFs,
): Promise<ConfigMigration> {
  const configPath = PRESETS_PLUS_CONFIG.path(ctx, scope);
  const presetsPath = getLegacyPresetsPath(ctx, scope);
  const policyPath = getUserPolicyPath(ctx);
  const sidecars = scope === "user" ? [presetsPath, policyPath] : [presetsPath];
  const configRead = await readJson(fs, configPath);
  const skipped: ConfigMigration = { migrated: [], warnings: [] };

  if (configRead.exists && configRead.error && scope === "user") {
    return failed(configPath, configRead.error);
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
      return failed(path, result.error);
    }

    if (!isVersion1(result.value)) {
      return failed(path, `expected a version 1 JSON object`);
    }

    existing.push({ path, value: result.value });
  }

  if (existing.length === 0) return skipped;

  const document: ConfigDocument = {};
  const config = existing.find((entry) => entry.path === configPath)?.value;
  const presets = existing.find((entry) => entry.path === presetsPath)?.value;
  const policy = existing.find((entry) => entry.path === policyPath)?.value;

  if (config?.showInactiveStatus !== undefined) {
    if (typeof config.showInactiveStatus !== "boolean")
      return failed(configPath, `"showInactiveStatus" must be a boolean`);
    document.showInactiveStatus = config.showInactiveStatus;
  }

  if (presets) {
    if (!Array.isArray(presets.presets))
      return failed(presetsPath, `"presets" must be an array`);
    document.presets = presets.presets;
  }

  if (policy) {
    if (!Array.isArray(policy.rules))
      return failed(policyPath, `"rules" must be an array`);
    document.policy = { rules: policy.rules };
  }

  try {
    await PRESETS_PLUS_CONFIG.write(ctx, scope, document);
  } catch (error) {
    return failed(
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

  return { migrated: [configPath], warnings };
}

/** The outcome of a scope whose migration failed because of `path`. */
function failed(path: string, reason: string): ConfigMigration {
  return {
    migrated: [],
    warnings: [
      `Migration failed for ${path}: ${reason}. See the migration guidance in the README.`,
    ],
  };
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
