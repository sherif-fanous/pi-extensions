/**
 * The hotkey rules every surface shares: how a typed hotkey parses and
 * normalizes, which keys are Pi built-ins, which preset owns each key
 * across the merged preset list, when a hotkey counts as changed, and the
 * warnings about each.
 */
import { samePresetIdentity, type PresetIdentity } from "./preset-identity.js";
import type { LoadedPreset } from "./types.js";

/** What the hotkey rules found across a merged preset list. */
export interface HotkeyAnalysis {
  /** The keys to register, one per owning preset, in preset order. */
  readonly bindings: readonly HotkeyBinding[];
  /**
   * Copies of the presets, in the same order, each with its
   * `hotkeyConflict` and `hotkeyShadowsBuiltin` annotations recomputed.
   */
  readonly presets: LoadedPreset[];
  /**
   * Warnings about the hotkeys: conflicts, then invalid hotkeys, then bound
   * hotkeys that shadow a Pi built-in, each in preset order.
   */
  readonly warnings: readonly string[];
}

/** A normalized key and the preset that owns it. */
export interface HotkeyBinding extends PresetIdentity {
  readonly key: string;
}

/** A hotkey diagnostic for the editor's Hotkey row. */
export interface HotkeyDiagnostic {
  readonly message: string;
  readonly severity: "error" | "warning";
}

/**
 * A preset as the editor would save it: its identity, its typed hotkey,
 * and the saved preset it replaces when editing one.
 */
export interface HotkeyDraft extends PresetIdentity {
  readonly hotkey: string;
  readonly replaces?: PresetIdentity | undefined;
}

/** The fields the ownership rules read from a preset. */
type HotkeyHolder = PresetIdentity & {
  readonly hotkey?: string | undefined;
  readonly shadowed?: boolean | undefined;
};

/** Modifier keys a hotkey may combine with its key. */
type HotkeyModifier = "alt" | "ctrl" | "shift";

/** What the rules decided for one preset's hotkey. */
type HotkeyOutcome =
  | { readonly kind: "invalid"; readonly reason: string }
  | {
      readonly kind: "lost";
      readonly key: string;
      readonly winner: PresetIdentity;
    }
  | { readonly kind: "none" }
  | { readonly kind: "owned"; readonly key: string }
  | { readonly kind: "shadowed"; readonly key: string };

/** Parse outcome carrying either the normalized key or a reason it failed. */
type ParseHotkeyResult =
  { ok: true; key: string } | { ok: false; reason: string };

/**
 * Fixed modifier order used to build the normalized form of a hotkey, so
 * the same modifiers typed in any order normalize to one string.
 */
const MODIFIER_ORDER: readonly HotkeyModifier[] = ["ctrl", "shift", "alt"];
/** Modifier names recognized in a typed hotkey. */
const MODIFIERS = new Set<string>(MODIFIER_ORDER);
/** Named keys accepted as the key portion of a hotkey. */
const SPECIAL_KEYS = new Set([
  "backspace",
  "clear",
  "delete",
  "down",
  "end",
  "enter",
  "esc",
  "escape",
  "home",
  "insert",
  "left",
  "pageDown",
  "pageUp",
  "return",
  "right",
  "space",
  "tab",
  "up",
]);
/**
 * Symbol keys accepted as the key portion of a hotkey.
 *
 * Shifted symbols depend on the keyboard layout, so `ctrl+!` and
 * `ctrl+shift+1` normalize to different strings even where one chord
 * produces both, and the rules treat them as separate hotkeys.
 */
const SYMBOL_KEYS = new Set([
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "+",
  "|",
  "~",
  "{",
  "}",
  ":",
  "<",
  ">",
  "?",
]);
/** Default keybindings Pi documents in `docs/keybindings.md`. */
const PI_BUILTIN_HOTKEYS: readonly string[] = [
  "alt+b",
  "alt+backspace",
  "alt+d",
  "alt+delete",
  "alt+down",
  "alt+enter",
  "alt+f",
  "alt+left",
  "alt+right",
  "alt+up",
  "alt+v",
  "alt+y",
  "backspace",
  "ctrl+-",
  "ctrl+]",
  "ctrl+alt+]",
  "ctrl+a",
  "ctrl+b",
  "ctrl+backspace",
  "ctrl+c",
  "ctrl+d",
  "ctrl+e",
  "ctrl+f",
  "ctrl+g",
  "ctrl+k",
  "ctrl+l",
  "ctrl+left",
  "ctrl+n",
  "ctrl+o",
  "ctrl+p",
  "ctrl+r",
  "ctrl+right",
  "ctrl+s",
  "ctrl+t",
  "ctrl+u",
  "ctrl+v",
  "ctrl+w",
  "ctrl+x",
  "ctrl+y",
  "ctrl+z",
  "delete",
  "down",
  "end",
  "enter",
  "escape",
  "home",
  "left",
  "pageDown",
  "pageUp",
  "right",
  "shift+ctrl+o",
  "shift+ctrl+p",
  "shift+enter",
  "shift+l",
  "shift+t",
  "shift+tab",
  "tab",
  "up",
];
/** Normalized forms of every Pi built-in. */
const NORMALIZED_PI_BUILTINS: ReadonlySet<string> = new Set(
  PI_BUILTIN_HOTKEYS.map((hotkey) => {
    const parsed = parseHotkey(hotkey);

    if (!parsed.ok) {
      throw new Error(`Pi built-in hotkey "${hotkey}" does not parse.`);
    }

    return parsed.key;
  }),
);

/**
 * Decide which preset owns each hotkey in a merged preset list, and warn
 * about conflicts, invalid hotkeys, and bound hotkeys that shadow a Pi
 * built-in.
 *
 * Shadowed presets never own a key, and the earlier preset wins a
 * conflict.
 */
export function analyzeHotkeys(
  presets: readonly LoadedPreset[],
): HotkeyAnalysis {
  const bindings: HotkeyBinding[] = [];
  const conflictWarnings: string[] = [];
  const invalidWarnings: string[] = [];
  const builtinWarnings: string[] = [];
  const annotated: LoadedPreset[] = [];

  for (const [preset, outcome] of resolveHotkeys(presets)) {
    const hotkey = preset.hotkey ?? "";
    const shadowsBuiltin =
      outcome.kind !== "none" &&
      outcome.kind !== "invalid" &&
      NORMALIZED_PI_BUILTINS.has(outcome.key);

    annotated.push({
      ...preset,
      hotkeyConflict: outcome.kind === "lost" ? true : undefined,
      hotkeyShadowsBuiltin: shadowsBuiltin ? true : undefined,
    });

    switch (outcome.kind) {
      case "invalid":
        invalidWarnings.push(
          `Preset "${preset.name}" has invalid hotkey "${hotkey}" (${outcome.reason}). Ignored it, so it is not registered or checked for conflicts until it is fixed.`,
        );

        break;
      case "lost":
        conflictWarnings.push(
          `Preset "${preset.name}" hotkey "${hotkey}" conflicts with preset "${outcome.winner.name}" (${outcome.winner.scope}). The first registered wins.`,
        );

        break;
      case "owned":
        bindings.push({
          key: outcome.key,
          name: preset.name,
          scope: preset.scope,
        });

        if (shadowsBuiltin) {
          builtinWarnings.push(
            `Preset "${preset.name}" hotkey "${hotkey}" shadows a Pi built-in. The preset binding will take precedence.`,
          );
        }

        break;
      case "none":
      case "shadowed":
        break;
    }
  }

  return {
    bindings,
    presets: annotated,
    warnings: [...conflictWarnings, ...invalidWarnings, ...builtinWarnings],
  };
}

/**
 * The diagnostic for a hotkey typed in the editor, or `undefined` when the
 * hotkey is empty or needs no warning.
 *
 * An unparseable hotkey is an error, and a Pi built-in comes before a
 * conflict. A conflict is reported only when, with the draft saved, another
 * preset would own the key.
 */
export function diagnoseDraftHotkey(
  draft: HotkeyDraft,
  presets: readonly LoadedPreset[],
): HotkeyDiagnostic | undefined {
  const hotkey = draft.hotkey.trim();

  if (hotkey.length === 0) return undefined;

  const parsed = parseHotkey(hotkey);

  if (!parsed.ok) return { message: parsed.reason, severity: "error" };

  if (NORMALIZED_PI_BUILTINS.has(parsed.key)) {
    return {
      message: `⚠ ${parsed.key} shadows a Pi built-in. Saving will replace Pi's behavior for this key.`,
      severity: "warning",
    };
  }

  const owner = resolveHotkeys(presetsAfterSave(draft, presets)).find(
    ([, outcome]) => outcome.kind === "owned" && outcome.key === parsed.key,
  )?.[0];

  if (owner === undefined || samePresetIdentity(owner, draft)) {
    return undefined;
  }

  return {
    message: `⚠ ${parsed.key} is already used by preset "${owner.name}". Pi will skip this preset's binding.`,
    severity: "warning",
  };
}

/**
 * Whether two hotkey declarations differ once each is normalized. A
 * hotkey that does not parse compares by its trimmed text.
 */
export function hotkeyChanged(
  previous: string | undefined,
  next: string | undefined,
): boolean {
  return normalizeForChange(previous) !== normalizeForChange(next);
}

function isValidKey(key: string): boolean {
  if (/^[a-z0-9]$/.test(key)) return true;
  if (/^f(?:[1-9]|1[0-2])$/.test(key)) return true;
  if (SPECIAL_KEYS.has(key)) return true;

  return SYMBOL_KEYS.has(key);
}

function normalizeForChange(hotkey: string | undefined): string {
  const trimmed = hotkey?.trim() ?? "";

  if (trimmed.length === 0) return "";

  const parsed = parseHotkey(trimmed);

  return parsed.ok ? parsed.key : trimmed;
}

function normalizeKey(key: string): string {
  switch (key) {
    case "return":
      return "enter";
    case "escape":
      return "esc";
    case "pagedown":
      return "pageDown";
    case "pageup":
      return "pageUp";
    default:
      return key;
  }
}

/** Parse a typed hotkey such as `Shift+Ctrl+P` into its normalized form. */
function parseHotkey(text: string): ParseHotkeyResult {
  const raw = text.trim().toLowerCase();

  if (raw.length === 0) return { ok: false, reason: "hotkey is empty" };

  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return { ok: false, reason: "hotkey is empty" };

  const modifierSet = new Set<HotkeyModifier>();
  let key: string | undefined;

  for (const part of parts) {
    if (MODIFIERS.has(part)) {
      const modifier = part as HotkeyModifier;

      if (modifierSet.has(modifier)) {
        return { ok: false, reason: `duplicate modifier "${modifier}"` };
      }

      modifierSet.add(modifier);
    } else if (key === undefined) {
      key = normalizeKey(part);
    } else {
      return { ok: false, reason: "hotkey must contain exactly one key" };
    }
  }

  if (!key) return { ok: false, reason: "hotkey is missing a key" };
  if (!isValidKey(key))
    return { ok: false, reason: `unsupported key "${key}"` };

  const modifiers = MODIFIER_ORDER.filter((modifier) =>
    modifierSet.has(modifier),
  );

  return { ok: true, key: [...modifiers, key].join("+") };
}

/**
 * The merged list as it would load once the draft is saved: an edit in
 * the same scope keeps its place, anything else goes last in its scope,
 * and user presets named like a project preset are shadowed.
 */
function presetsAfterSave(
  draft: HotkeyDraft,
  presets: readonly LoadedPreset[],
): HotkeyHolder[] {
  const entry: HotkeyHolder = {
    hotkey: draft.hotkey,
    name: draft.name,
    scope: draft.scope,
  };
  const replacedIndex = presets.findIndex((preset) =>
    samePresetIdentity(preset, draft.replaces),
  );
  const others: HotkeyHolder[] = presets.filter(
    (_preset, index) => index !== replacedIndex,
  );
  const firstProjectIndex = others.findIndex(
    (preset) => preset.scope === "project",
  );
  const scopeEnd =
    draft.scope === "user" && firstProjectIndex >= 0
      ? firstProjectIndex
      : others.length;
  const insertAt =
    replacedIndex >= 0 && draft.replaces?.scope === draft.scope
      ? replacedIndex
      : scopeEnd;
  const placed = [
    ...others.slice(0, insertAt),
    entry,
    ...others.slice(insertAt),
  ];
  const projectNames = new Set(
    placed
      .filter((preset) => preset.scope === "project")
      .map((preset) => preset.name),
  );

  return placed.map((preset) => ({
    ...preset,
    shadowed: preset.scope === "user" && projectNames.has(preset.name),
  }));
}

/** Pair each preset with what the ownership rules decided for its hotkey. */
function resolveHotkeys<T extends HotkeyHolder>(
  presets: readonly T[],
): [T, HotkeyOutcome][] {
  const owners = new Map<string, PresetIdentity>();

  return presets.map((preset): [T, HotkeyOutcome] => {
    if (!preset.hotkey) return [preset, { kind: "none" }];

    const parsed = parseHotkey(preset.hotkey);

    if (!parsed.ok) {
      return [preset, { kind: "invalid", reason: parsed.reason }];
    }

    if (preset.shadowed === true) {
      return [preset, { kind: "shadowed", key: parsed.key }];
    }

    const winner = owners.get(parsed.key);

    if (winner) return [preset, { kind: "lost", key: parsed.key, winner }];

    owners.set(parsed.key, { name: preset.name, scope: preset.scope });

    return [preset, { kind: "owned", key: parsed.key }];
  });
}
