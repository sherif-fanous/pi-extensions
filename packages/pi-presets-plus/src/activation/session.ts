/**
 * Holds the record of the preset attached to the session: what it
 * declared, what it wrote to Pi over which baseline, and how Pi compares
 * now. Makes every write to Pi inside its own self-trigger guard and keeps
 * the session entry, the status badge, and the dirty flag in step.
 */
import { findPreset, samePresetIdentity } from "../preset-identity.js";
import type {
  ActivePresetState,
  LoadedPreset,
  ModelIdentity,
  PiState,
  PresetDeclaration,
  PresetOverlay,
  ThinkingLevel,
} from "../types.js";
import { renderStatusBadge, STATUS_KEY } from "../ui/status.js";
import { effectiveThinkingLevel } from "./thinking.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Values a clear writes back to Pi, leaving out the fields it leaves alone. */
export interface BaselineWrites {
  readonly model?: ModelIdentity;
  readonly thinkingLevel?: ThinkingLevel;
  readonly tools?: readonly string[];
}

/** How Pi's values relate to the active preset, read from one snapshot. */
export interface OverlayAssessment {
  readonly active: ActivePresetState;
  /** The Pi values the assessment read. */
  readonly current: PiState;
  /**
   * The fields Pi no longer holds the preset's values for. Tools count
   * only when the values the preset holds Pi to include a non-empty tool
   * list.
   */
  readonly driftReasons: readonly DriftReason[];
  /** Absent when the record has no overlay, so nothing can be restored. */
  readonly overlay?: OverlayComparison;
}

/** The record's overlay and how each current Pi value relates to it. */
export interface OverlayComparison extends PresetOverlay {
  readonly model: OverlayFieldClassification;
  readonly thinking: OverlayFieldClassification;
  /** `not-owned` when no preset in the overlay wrote tools. */
  readonly tools: "not-owned" | OverlayFieldClassification;
}

/** The values an activation writes to Pi. */
export interface PresetWrites {
  readonly model: Model<Api>;
  readonly thinkingLevel: ThinkingLevel;
  /** The tools to activate, or absent to leave Pi's tools as they are. */
  readonly tools?: readonly string[];
}

/** A field whose Pi value no longer matches the active preset. */
export type DriftReason = "model" | "thinking level" | "tools";

/**
 * How a current Pi value relates to the overlay.
 *
 * `already-baseline` matches the value before activation, so a clear
 * leaves the field alone. `matches-last-applied` matches what the overlay
 * wrote, so a clear restores the baseline. `user-override` matches
 * neither, so a clear leaves the user's value in place.
 */
export type OverlayFieldClassification =
  "already-baseline" | "matches-last-applied" | "user-override";

/** Custom session entry type that records the active preset. */
const ACTIVE_ENTRY_TYPE = "presets-plus:active";

/** Payload version this release writes; a payload without one is version 1. */
const ACTIVE_ENTRY_VERSION = 1;

/** The values the active preset holds Pi to, which drift compares against. */
interface HeldValues {
  readonly model: ModelIdentity;
  readonly thinkingLevel: ThinkingLevel;
  readonly tools?: readonly string[];
}

type ActiveEntryData = { readonly version?: unknown } & (
  | { readonly name: string; readonly scope?: LoadedPreset["scope"] }
  | { readonly name: null }
);
type AssessContext = Pick<ExtensionContext, "model" | "modelRegistry">;
type AssessPi = Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">;
type Branch = ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
type SessionContext = Pick<ExtensionContext, "ui">;

type SessionPi = Pick<ExtensionAPI, "appendEntry">;

/** Owns the active-preset record for one extension invocation. */
export class ActivePresetSession {
  private active: ActivePresetState | undefined;
  private selfTriggerDepth = 0;
  private showInactiveStatus = true;

  /**
   * Write `writes` to Pi for `preset` and attach it with the record of what
   * was written.
   *
   * An attached overlay's baseline and tools carry over; otherwise the
   * baseline is Pi's values before the writes. Resolves `false`, writing
   * nothing more and leaving the record as it was, when Pi refuses the
   * model.
   */
  async apply(
    preset: LoadedPreset,
    writes: PresetWrites,
    ctx: AssessContext & SessionContext,
    pi: AssessPi &
      SessionPi &
      Pick<ExtensionAPI, "setActiveTools" | "setModel" | "setThinkingLevel">,
  ): Promise<boolean> {
    const carried = this.active?.overlay;
    const baseline = carried?.baseline ?? readPi(ctx, pi);
    const written = await this.selfTriggered(async () => {
      if (!(await pi.setModel(writes.model))) return false;

      pi.setThinkingLevel(writes.thinkingLevel);

      if (writes.tools !== undefined) pi.setActiveTools([...writes.tools]);

      return true;
    });

    if (!written) return false;

    const tools = writes.tools ?? carried?.written.tools;

    this.attach(
      {
        declared: declarationOf(preset),
        dirty: false,
        name: preset.name,
        overlay: {
          baseline,
          written: {
            model: { id: preset.model, provider: preset.provider },
            thinkingLevel: writes.thinkingLevel,
            ...(tools === undefined ? {} : { tools: [...tools] }),
          },
        },
        scope: preset.scope,
      },
      ctx,
      pi,
    );

    return true;
  }

  /**
   * Compare Pi's current values with the active preset, or `undefined`
   * when none is attached.
   */
  assess(ctx: AssessContext, pi: AssessPi): OverlayAssessment | undefined {
    const active = this.active;

    if (!active) return undefined;

    const current = readPi(ctx, pi);
    const held = active.overlay
      ? active.overlay.written
      : heldByDeclaration(active.declared, ctx);

    return {
      active,
      current,
      driftReasons: driftReasons(current, held),
      ...(active.overlay
        ? { overlay: compareOverlay(active.overlay, current) }
        : {}),
    };
  }

  /**
   * Write `writes` back to Pi, then detach the preset and persist the
   * clear marker.
   *
   * Pi resets the thinking level when it switches model, so a restored
   * model is followed by the level Pi had before unless `writes` names
   * one. Resolves whether Pi took the model, and `true` when there was no
   * model to write. A model Pi can't find, refuses, or throws on still
   * leaves the other fields written.
   */
  async clear(
    writes: BaselineWrites,
    ctx: Pick<ExtensionContext, "modelRegistry"> & SessionContext,
    pi: SessionPi &
      Pick<
        ExtensionAPI,
        "getThinkingLevel" | "setActiveTools" | "setModel" | "setThinkingLevel"
      >,
  ): Promise<boolean> {
    const modelRestored = await this.selfTriggered(async () => {
      const thinkingBefore = pi.getThinkingLevel();
      const restored =
        writes.model !== undefined &&
        (await restoreModel(writes.model, ctx, pi));
      const thinkingLevel =
        writes.thinkingLevel ?? (restored ? thinkingBefore : undefined);

      if (thinkingLevel !== undefined) pi.setThinkingLevel(thinkingLevel);

      if (writes.tools !== undefined) pi.setActiveTools([...writes.tools]);

      return writes.model === undefined || restored;
    });

    this.active = undefined;
    pi.appendEntry(ACTIVE_ENTRY_TYPE, {
      version: ACTIVE_ENTRY_VERSION,
      name: null,
    });
    this.setStatus(ctx);

    return modelRestored;
  }

  /** The active-preset record, if a preset is attached. */
  current(): ActivePresetState | undefined {
    return this.active;
  }

  /**
   * Whether `preset` is attached unedited with a saved baseline and Pi
   * still holds what applying it wrote, so applying it again would write
   * nothing.
   */
  isApplied(preset: LoadedPreset, ctx: AssessContext, pi: AssessPi): boolean {
    const active = this.active;

    return (
      active?.overlay !== undefined &&
      samePresetIdentity(active, preset) &&
      sameDeclaration(active.declared, preset) &&
      driftReasons(readPi(ctx, pi), active.overlay.written).length === 0
    );
  }

  /** Whether the event being handled comes from this session's own write. */
  isSelfTriggered(): boolean {
    return this.selfTriggerDepth > 0;
  }

  /** Mark the active preset clean, keeping the rest of its record. */
  markClean(ctx: SessionContext): void {
    if (!this.active?.dirty) return;

    this.active = { ...this.active, dirty: false };
    this.setStatus(ctx);
  }

  /** Mark the active preset dirty, keeping the rest of its record. */
  markDirty(ctx: SessionContext): void {
    if (!this.active || this.active.dirty) return;

    this.active = { ...this.active, dirty: true };
    this.setStatus(ctx);
  }

  /**
   * Reattach the preset the session branch last recorded, without a
   * baseline, and return the record with any warnings.
   */
  restoreFromBranch(
    branch: Branch,
    presets: readonly LoadedPreset[],
    ctx: SessionContext,
  ): { state: ActivePresetState | undefined; warnings: string[] } {
    const result = computeRestore(branch, presets);

    this.active = result.state;
    this.setStatus(ctx);

    return result;
  }

  /** Configure whether the inactive footer status remains visible. */
  setShowInactiveStatus(show: boolean, ctx: SessionContext): void {
    this.showInactiveStatus = show;
    this.setStatus(ctx);
  }

  /**
   * Update the active preset identity after an editor rename or scope move,
   * refreshing the status badge so the footer shows the new name.
   */
  updateIdentity(
    name: string,
    scope: LoadedPreset["scope"],
    ctx: SessionContext,
    pi: SessionPi,
  ): void {
    if (!this.active) return;

    this.active = { ...this.active, name, scope };
    pi.appendEntry(ACTIVE_ENTRY_TYPE, {
      version: ACTIVE_ENTRY_VERSION,
      name,
      scope,
    });
    this.setStatus(ctx);
  }

  private attach(
    next: ActivePresetState,
    ctx: SessionContext,
    pi: SessionPi,
  ): void {
    this.active = next;
    pi.appendEntry(ACTIVE_ENTRY_TYPE, {
      version: ACTIVE_ENTRY_VERSION,
      name: next.name,
      scope: next.scope,
    });
    this.setStatus(ctx);
  }

  /** Run Pi writes so the drift handlers ignore the events they fire. */
  private async selfTriggered<T>(fn: () => Promise<T>): Promise<T> {
    this.selfTriggerDepth++;

    try {
      return await fn();
    } finally {
      this.selfTriggerDepth--;
    }
  }

  private setStatus(ctx: SessionContext): void {
    ctx.ui.setStatus(
      STATUS_KEY,
      renderStatusBadge(this.active, ctx.ui.theme, this.showInactiveStatus),
    );
  }
}

/** Classify `current` against the baseline and last-written values. */
function classifyField<T>(
  current: T,
  baseline: T,
  written: T,
  equals: (left: T, right: T) => boolean,
): OverlayFieldClassification {
  if (equals(current, baseline)) return "already-baseline";
  if (equals(current, written)) return "matches-last-applied";

  return "user-override";
}

function compareOverlay(
  overlay: PresetOverlay,
  current: PiState,
): OverlayComparison {
  const { baseline, written } = overlay;

  return {
    baseline,
    model: classifyField(
      current.model,
      baseline.model,
      written.model,
      sameModel,
    ),
    thinking: classifyField(
      current.thinkingLevel,
      baseline.thinkingLevel,
      written.thinkingLevel,
      Object.is,
    ),
    tools:
      written.tools === undefined
        ? "not-owned"
        : classifyField(current.tools, baseline.tools, written.tools, sameSet),
    written,
  };
}

function computeRestore(
  branch: Branch,
  presets: readonly LoadedPreset[],
): { state: ActivePresetState | undefined; warnings: string[] } {
  const activeEntry = [...branch]
    .reverse()
    .find(
      (entry): entry is Extract<typeof entry, { type: "custom" }> =>
        entry.type === "custom" && entry.customType === ACTIVE_ENTRY_TYPE,
    );

  if (!activeEntry) {
    return { state: undefined, warnings: [] };
  }

  const data = activeEntry.data as ActiveEntryData | undefined;

  // An entry from a release with another payload version is not read.
  if (
    !data ||
    (data.version ?? 1) !== ACTIVE_ENTRY_VERSION ||
    data.name === null
  ) {
    return { state: undefined, warnings: [] };
  }

  const preset = findPreset(presets, {
    name: data.name,
    scope: data.scope ?? "user",
  });

  if (!preset) {
    return {
      state: undefined,
      warnings: [
        `The restored session references preset "${data.name}", which is not loaded. Did not attach it.`,
      ],
    };
  }

  if (preset.unavailable) {
    return {
      state: undefined,
      warnings: [
        `The restored session references preset "${data.name}", which is unavailable (${preset.unavailable}). Did not attach it.`,
      ],
    };
  }

  return {
    state: {
      declared: declarationOf(preset),
      dirty: false,
      name: preset.name,
      scope: preset.scope,
    },
    warnings: [],
  };
}

/** Copy the fields of `preset` the record keeps as its declaration. */
function declarationOf(preset: PresetDeclaration): PresetDeclaration {
  return {
    model: preset.model,
    provider: preset.provider,
    ...(preset.thinkingLevel === undefined
      ? {}
      : { thinkingLevel: preset.thinkingLevel }),
    ...(preset.tools === undefined ? {} : { tools: [...preset.tools] }),
  };
}

/** The fields whose `current` value differs from `held`. */
function driftReasons(current: PiState, held: HeldValues): DriftReason[] {
  const reasons: DriftReason[] = [];

  if (!sameModel(current.model, held.model)) reasons.push("model");

  if (current.thinkingLevel !== held.thinkingLevel) {
    reasons.push("thinking level");
  }

  if (held.tools !== undefined && !sameSet(current.tools, held.tools)) {
    reasons.push("tools");
  }

  return reasons;
}

/**
 * The values a preset declaration holds Pi to, with its thinking level
 * clamped to what the registry's model supports. An empty tools list holds
 * no tools, because a reattached record doesn't know which of them Pi had.
 */
function heldByDeclaration(
  declared: PresetDeclaration,
  ctx: Pick<ExtensionContext, "modelRegistry">,
): HeldValues {
  return {
    model: { id: declared.model, provider: declared.provider },
    thinkingLevel: effectiveThinkingLevel(
      declared,
      ctx.modelRegistry.find(declared.provider, declared.model),
    ),
    ...(declared.tools === undefined || declared.tools.length === 0
      ? {}
      : { tools: declared.tools }),
  };
}

/** Read Pi's current model, thinking level, and active tools. */
function readPi(ctx: Pick<ExtensionContext, "model">, pi: AssessPi): PiState {
  return {
    model: ctx.model
      ? { id: ctx.model.id, provider: ctx.model.provider }
      : null,
    thinkingLevel: pi.getThinkingLevel(),
    tools: pi.getActiveTools(),
  };
}

/** Switch Pi to `target`, reporting a model Pi lacks or rejects as `false`. */
async function restoreModel(
  target: ModelIdentity,
  ctx: Pick<ExtensionContext, "modelRegistry">,
  pi: Pick<ExtensionAPI, "setModel">,
): Promise<boolean> {
  const model = ctx.modelRegistry.find(target.provider, target.id);

  if (!model) return false;

  try {
    return await pi.setModel(model);
  } catch {
    return false;
  }
}

/** Whether two declarations name the same model, thinking level, and tools. */
function sameDeclaration(
  left: PresetDeclaration,
  right: PresetDeclaration,
): boolean {
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    left.thinkingLevel === right.thinkingLevel &&
    (left.tools === undefined || right.tools === undefined
      ? left.tools === right.tools
      : sameSet(left.tools, right.tools))
  );
}

/**
 * Whether two models are the same. Two absent models are the same, and an
 * absent model never matches a present one.
 */
function sameModel(
  left: ModelIdentity | null,
  right: ModelIdentity | null,
): boolean {
  return left?.provider === right?.provider && left?.id === right?.id;
}

/** Whether two tool lists hold the same names, ignoring order and repeats. */
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  );
}
