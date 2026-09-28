/**
 * Loads and mutates consolidated configuration across both scopes.
 * Every operation reads current files again so reloads and direct edits take effect.
 */
import { EXTENSION_NAME } from "../extension-name.js";
import { analyzeHotkeys, type HotkeyAnalysis } from "../hotkey-registry.js";
import type {
  LoadedPreset,
  Preset,
  PresetScope,
  ScopeConfig,
} from "../types.js";
import { formatScopeName } from "../ui/widgets.js";
import { CONFIG_VERSION, DEFAULT_CONFIG, loadScope } from "./config.js";
import { mergeScopes } from "./merge.js";
import { getConfigPath } from "./paths.js";
import { loadPolicy } from "./policy.js";
import { computeClampWarning } from "./validate.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  configFileWarnings,
  updateConfigFile,
  type ConfigFile,
} from "@sherif-fanous/pi-extensions-core";

/** Result of loading all presets. */
export interface LoadAllResult {
  /** The User then the Project file, for the status report's `Config:` block. */
  readonly files: readonly [ConfigFile, ConfigFile];
  readonly hotkeyAnalysis: HotkeyAnalysis;
  readonly presets: LoadedPreset[];
  readonly showInactiveStatus: boolean;
  /**
   * Warnings about values inside the loaded files: invalid settings,
   * presets, and a project policy section. The file problems the
   * `Config:` block shows are left out.
   */
  readonly valueWarnings: string[];
  /** Every load warning: the file problems first, then `valueWarnings`. */
  readonly warnings: string[];
}
/** Result type for mutating operations. */
export type SaveResult = { ok: true } | { ok: false; reason: string };
/** Subset of context needed by storage operations. */
type StorageContext = Pick<
  ExtensionContext,
  "cwd" | "isProjectTrusted" | "modelRegistry"
>;
/** Test seam for move writes. */
type WriteScope = (
  scope: PresetScope,
  presets: readonly Preset[],
  ctx: StorageContext,
) => Promise<void>;

/** Append a preset to a safe scope. */
export async function addPreset(
  preset: Preset,
  scope: PresetScope,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if ("ok" in loaded) return loaded;

  if (loaded.presets.some((existing) => existing.name === preset.name)) {
    return {
      ok: false,
      reason: `A preset named "${preset.name}" already exists in scope "${scope}".`,
    };
  }

  await writeDocument(scope, [...loaded.presets, preset], ctx);

  return { ok: true };
}

/**
 * Load both consolidated scopes, preserving user then project merge order.
 * The project file is read only while Pi trusts the project.
 */
export async function loadAll(ctx: StorageContext): Promise<LoadAllResult> {
  const location = { cwd: ctx.cwd, trusted: ctx.isProjectTrusted() };
  const [user, project] = await Promise.all([
    loadScope("user", location),
    loadScope("project", location),
  ]);
  const files = [user.file, project.file] as const;
  const showInactiveStatus =
    project.showInactiveStatus ?? user.showInactiveStatus;
  // Policy warnings for the user scope belong to loadPolicy. The project
  // scope has no other reader, so its policy warnings surface here.
  const valueWarnings = [
    ...scopeValueWarnings("user", user, showInactiveStatus),
    ...scopeValueWarnings("project", project, showInactiveStatus),
    ...project.warnings.policy,
  ];
  const presets = mergeScopes(
    { user: user.presets, project: project.presets },
    ctx,
  ).map((preset) => ({
    ...preset,
    ...(computeClampWarning(preset, ctx)
      ? { clampWarning: true as const }
      : {}),
  }));

  return {
    files,
    hotkeyAnalysis: analyzeHotkeys(presets),
    presets,
    showInactiveStatus: showInactiveStatus ?? DEFAULT_CONFIG.showInactiveStatus,
    valueWarnings,
    warnings: [...configFileWarnings(files), ...valueWarnings],
  };
}

/** Move a preset between scopes and restore the complete destination on source failure. */
export async function movePreset(
  oldName: string,
  sourceScope: PresetScope,
  destinationScope: PresetScope,
  nextPreset: Preset,
  ctx: StorageContext,
  writeScope: WriteScope = saveScope,
): Promise<SaveResult> {
  if (sourceScope === destinationScope)
    return {
      ok: false,
      reason: "Source and destination scopes must be different.",
    };

  const [source, destination] = await Promise.all([
    readScope(sourceScope, ctx),
    readScope(destinationScope, ctx),
  ]);

  if ("ok" in source) return source;
  if ("ok" in destination) return destination;

  const sourceIndex = source.presets.findIndex(
    (preset) => preset.name === oldName,
  );

  if (sourceIndex < 0)
    return {
      ok: false,
      reason: `No preset named "${oldName}" exists in scope "${sourceScope}".`,
    };

  if (destination.presets.some((preset) => preset.name === nextPreset.name)) {
    return {
      ok: false,
      reason: `A preset named "${nextPreset.name}" already exists in scope "${destinationScope}".`,
    };
  }

  const nextSource = source.presets.filter(
    (_preset, index) => index !== sourceIndex,
  );

  await writeScope(destinationScope, [...destination.presets, nextPreset], ctx);

  try {
    await writeScope(sourceScope, nextSource, ctx);
  } catch (sourceError) {
    try {
      await writeScope(destinationScope, destination.presets, ctx);
    } catch (rollbackError) {
      throw new AggregateError(
        [sourceError, rollbackError],
        `The preset move failed, and ${EXTENSION_NAME} could not restore the destination scope.`,
        { cause: rollbackError },
      );
    }

    throw sourceError;
  }

  return { ok: true };
}

/** Remove a preset by name, treating an absent name as a no-op. */
export async function removePreset(
  name: string,
  scope: PresetScope,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if ("ok" in loaded) return loaded;

  const next = loaded.presets.filter((preset) => preset.name !== name);

  if (next.length !== loaded.presets.length)
    await writeDocument(scope, next, ctx);

  return { ok: true };
}

/** Reorder one scope while retaining omitted entries in their original order. */
export async function reorderWithinScope(
  scope: PresetScope,
  orderedNames: readonly string[],
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if ("ok" in loaded) return loaded;

  const byName = new Map(
    loaded.presets.map((preset) => [preset.name, preset] as const),
  );
  const seen = new Set<string>();
  const next: Preset[] = [];

  for (const name of orderedNames) {
    const preset = byName.get(name);

    if (preset && !seen.has(name)) {
      next.push(preset);
      seen.add(name);
    }
  }

  for (const preset of loaded.presets)
    if (!seen.has(preset.name)) next.push(preset);
  await writeDocument(scope, next, ctx);

  return { ok: true };
}

/** Replace only a scope's presets section, preserving the rest of the file. */
export async function saveScope(
  scope: PresetScope,
  presets: readonly Preset[],
  ctx: StorageContext,
): Promise<void> {
  await writeDocument(scope, presets, ctx);
}

/** Project a preset onto its persisted fields. */
export function toPersistedPreset(preset: Preset): Preset {
  const output: Preset = {
    name: preset.name,
    provider: preset.provider,
    model: preset.model,
  };

  if (preset.thinkingLevel !== undefined)
    output.thinkingLevel = preset.thinkingLevel;
  if (preset.tools !== undefined) output.tools = [...preset.tools];
  if (preset.instructions !== undefined)
    output.instructions = preset.instructions;
  if (preset.hotkey !== undefined) output.hotkey = preset.hotkey;
  if (preset.order !== undefined) output.order = preset.order;

  return output;
}

/** Replace an existing preset in place, including renames without reordering. */
export async function updatePreset(
  oldName: string,
  scope: PresetScope,
  nextPreset: Preset,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if ("ok" in loaded) return loaded;

  const index = loaded.presets.findIndex((preset) => preset.name === oldName);

  if (index < 0)
    return {
      ok: false,
      reason: `No preset named "${oldName}" exists in scope "${scope}".`,
    };

  if (
    nextPreset.name !== oldName &&
    loaded.presets.some(
      (preset, i) => i !== index && preset.name === nextPreset.name,
    )
  ) {
    return {
      ok: false,
      reason: `A preset named "${nextPreset.name}" already exists in scope "${scope}".`,
    };
  }

  const next = [...loaded.presets];

  next[index] = nextPreset;
  await writeDocument(scope, next, ctx);

  return { ok: true };
}

/** Warnings from the sections every scope loads, leaving policy aside. */
function loadableWarnings(loaded: ScopeConfig): string[] {
  return [...loaded.warnings.file, ...loaded.warnings.presets];
}

/**
 * Load one scope for a mutation, or refuse when the project is not
 * trusted or the file did not load completely.
 */
async function readScope(
  scope: PresetScope,
  ctx: StorageContext,
): Promise<ScopeConfig | { ok: false; reason: string }> {
  const path = getConfigPath(scope, ctx.cwd);
  const trusted = ctx.isProjectTrusted();

  if (scope === "project" && !trusted) {
    return {
      ok: false,
      reason: `The project is not trusted, so ${path} was not saved. Trust the project and try again.`,
    };
  }

  const result = await loadScope(scope, { cwd: ctx.cwd, trusted });
  // Compiled-rule warnings only come from loadPolicy, which also carries
  // the user policy bucket, so the raw bucket is read here for project only.
  const policyWarnings =
    scope === "user"
      ? (await loadPolicy(undefined, ctx.cwd)).warnings
      : result.warnings.policy;
  const warnings = [...loadableWarnings(result), ...policyWarnings];

  if (warnings.length > 0 || result.invalidShowInactiveStatus !== undefined) {
    return {
      ok: false,
      reason: `${EXTENSION_NAME} did not change the ${scope} configuration file at ${path}. It could not load the complete file. Fix the file and try again.`,
    };
  }

  return result;
}

/**
 * Warnings `loadAll` shows about one scope's values, in setting, then
 * preset order. An invalid `showInactiveStatus` warning names the default when no
 * scope supplies a valid value, and otherwise says the value was ignored,
 * since the other scope's value applies.
 */
function scopeValueWarnings(
  scope: PresetScope,
  loaded: ScopeConfig,
  effectiveShowInactiveStatus: boolean | undefined,
): string[] {
  const invalid = loaded.invalidShowInactiveStatus;
  const settingWarnings =
    invalid === undefined
      ? []
      : [
          `${formatScopeName(scope)} setting "showInactiveStatus" must be a boolean, not ${JSON.stringify(invalid.value)}. ${
            effectiveShowInactiveStatus === undefined
              ? `Using the default value ${String(DEFAULT_CONFIG.showInactiveStatus)}.`
              : "Ignored it."
          }`,
        ];

  return [...settingWarnings, ...loaded.warnings.presets];
}

/**
 * Replace one scope's `presets` with `presets`, keeping the file's other
 * keys and stamping the current `version`.
 */
async function writeDocument(
  scope: PresetScope,
  presets: readonly Preset[],
  ctx: StorageContext,
): Promise<void> {
  await updateConfigFile(
    {
      path: getConfigPath(scope, ctx.cwd),
      scope,
      trusted: ctx.isProjectTrusted(),
      version: CONFIG_VERSION,
    },
    (data) => ({ ...data, presets: presets.map(toPersistedPreset) }),
  );
}
