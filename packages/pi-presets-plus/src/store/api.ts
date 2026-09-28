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
import { DEFAULT_CONFIG, parseScope, PRESETS_PLUS_CONFIG } from "./config.js";
import { mergeScopes } from "./merge.js";
import type { PolicyRules } from "./policy.js";
import { computeClampWarning } from "./validate.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ConfigOutcome } from "@sherif-fanous/pi-extensions-core";

/**
 * One read of both scope files: the merged presets, the settings, the
 * compiled user policy, and each warning in the place that shows it.
 */
export interface PresetsConfig {
  /**
   * What reading both files found, with a value warning for each invalid
   * setting, preset, and policy section. Session start,
   * `/presets reload`, and `/presets status` show these.
   */
  readonly config: ConfigOutcome<PresetScope>;
  readonly hotkeyAnalysis: HotkeyAnalysis;
  /** The user policy's rules; their warnings are in `config`. */
  readonly policy: PolicyRules;
  readonly presets: LoadedPreset[];
  readonly showInactiveStatus: boolean;
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
 * Read each scope file once, preserving user then project merge order.
 * The project file is read only while Pi trusts the project.
 */
export async function loadPresetsConfig(
  ctx: StorageContext,
): Promise<PresetsConfig> {
  const config = await PRESETS_PLUS_CONFIG.load(ctx);
  const user = parseScope("user", config.files.user);
  const project = parseScope("project", config.files.project);
  const showInactiveStatus =
    project.showInactiveStatus ?? user.showInactiveStatus;
  const valueWarnings = [
    ...scopeValueWarnings("user", user, showInactiveStatus),
    ...scopeValueWarnings("project", project, showInactiveStatus),
    ...user.warnings.policy,
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
    config: config.withValueWarnings(valueWarnings),
    hotkeyAnalysis: analyzeHotkeys(presets),
    policy: { rules: user.policyRules },
    presets,
    showInactiveStatus: showInactiveStatus ?? DEFAULT_CONFIG.showInactiveStatus,
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

/**
 * Read one scope's file once for a mutation, or refuse when the project is
 * not trusted or the file did not load completely.
 */
async function readScope(
  scope: PresetScope,
  ctx: StorageContext,
): Promise<ScopeConfig | { ok: false; reason: string }> {
  const path = PRESETS_PLUS_CONFIG.path(ctx, scope);

  if (scope === "project" && !ctx.isProjectTrusted()) {
    return {
      ok: false,
      reason: `The project is not trusted, so ${path} was not saved. Trust the project and try again.`,
    };
  }

  const result = parseScope(scope, await PRESETS_PLUS_CONFIG.read(ctx, scope));
  const { file, policy, presets } = result.warnings;

  if (
    file.length + presets.length + policy.length > 0 ||
    result.invalidShowInactiveStatus !== undefined
  ) {
    return {
      ok: false,
      reason: `${EXTENSION_NAME} did not change the ${scope} configuration file at ${path}. It could not load the complete file. Fix the file and try again.`,
    };
  }

  return result;
}

/**
 * Warnings `loadPresetsConfig` shows about one scope's values, in setting,
 * then preset order. An invalid `showInactiveStatus` warning names the
 * default when no scope supplies a valid value, and otherwise says the
 * value was ignored, since the other scope's value applies.
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
  await PRESETS_PLUS_CONFIG.update(ctx, scope, (data) => ({
    ...data,
    presets: presets.map(toPersistedPreset),
  }));
}
