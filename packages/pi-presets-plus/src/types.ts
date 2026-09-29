/**
 * Type definitions shared across pi-presets-plus: the persisted preset
 * shapes, the scope and loader output types, the activation state, and the
 * thinking levels a preset may record.
 */

import type { CompiledPolicyRule } from "./store/policy.js";
import type { ConfigFile } from "@sherif-fanous/pi-extensions-core";

/**
 * The record of the preset attached to the session, held in memory only.
 *
 * `overlay` is absent when the preset was reattached from the session
 * branch on resume or reload, which saves no baseline, so clearing can only
 * turn the preset off.
 */
export interface ActivePresetState {
  readonly declared: PresetDeclaration;
  /** Whether Pi no longer holds the preset's values. */
  readonly dirty: boolean;
  readonly name: string;
  readonly overlay?: PresetOverlay;
  readonly scope: PresetScope;
}

/**
 * A parsed version 2 configuration document, including unknown fields. A
 * document without `version` reads as version 2.
 */
export interface ConfigDocument {
  version?: 2;
  showInactiveStatus?: boolean;
  presets?: unknown[];
  policy?: unknown;
  [key: string]: unknown;
}

/**
 * A preset carrying the merge and availability metadata computed at load
 * time. Those annotations can change on every reload, so callers must not
 * assume they survive a `ctx.reload()`.
 */
export interface LoadedPreset extends Preset {
  /** Scope of the file this preset was read from. */
  scope: PresetScope;
  /**
   * `true` for a global preset whose name is also defined in the project
   * file (the project entry wins at activation time).
   */
  shadowed?: boolean;
  /**
   * Reason the preset cannot be activated. `"no-model"` means the model id
   * is not registered for the named provider, `"no-key"` means the model is
   * registered but its provider has no API key. Undefined when the preset
   * is available.
   */
  unavailable?: "no-key" | "no-model";
  /**
   * True when the preset asks for extended thinking on a model that clamps
   * it to off at activation time.
   */
  clampWarning?: true;
  /** True when another preset claimed this preset's hotkey first. */
  hotkeyConflict?: true | undefined;
  /** True when the parsed hotkey matches a Pi built-in keybinding. */
  hotkeyShadowsBuiltin?: true | undefined;
}

/** A model named by its provider and id. */
export interface ModelIdentity {
  readonly provider: string;
  readonly id: string;
}

/** Pi's model, thinking level, and active tools at one moment. */
export interface PiState {
  readonly model: ModelIdentity | null;
  readonly thinkingLevel: ThinkingLevel;
  readonly tools: readonly string[];
}

/**
 * A preset definition as it appears in either scope's JSON file.
 *
 * `name`, `provider`, and `model` are required. Storage validates the
 * shape of the optional fields and round-trips them verbatim.
 */
export interface Preset {
  /** Unique within a single file; merge-time shadowing is by name. */
  name: string;
  /** Provider id (e.g. `"anthropic"`, `"openai"`). */
  provider: string;
  /** Model id within `provider` (e.g. `"claude-opus-4.5"`). */
  model: string;
  /** Reasoning level to apply. Activation falls back to `"off"`. */
  thinkingLevel?: ThinkingLevel;
  /**
   * Tools to activate. Omitting the field or leaving it empty passes the
   * session tools through unchanged.
   */
  tools?: string[];
  /** Free-form text appended to the system prompt at apply time. */
  instructions?: string;
  /** Key combination that activates the preset, such as `ctrl+shift+1`. */
  hotkey?: string;
  /** Ordering value round-tripped by storage; the file order is the default. */
  order?: number;
}

/** The model, thinking level, and tools a preset declared when attached. */
export interface PresetDeclaration {
  readonly provider: string;
  readonly model: string;
  readonly thinkingLevel?: ThinkingLevel;
  readonly tools?: readonly string[];
}

/**
 * What the presets applied since the last clear wrote to Pi, over the Pi
 * values they replaced.
 */
export interface PresetOverlay {
  /** Pi's values before the first of those presets, which clear restores. */
  readonly baseline: PiState;
  /**
   * The values last written. `tools` carries over from an earlier preset
   * when a later one declares none, and is absent while no preset has
   * written tools, which leaves them outside the overlay.
   */
  readonly written: {
    readonly model: ModelIdentity;
    readonly thinkingLevel: ThinkingLevel;
    readonly tools?: readonly string[];
  };
}

/** Result of loading one consolidated configuration scope. */
export interface ScopeConfig {
  /** The file's contents, or `{}` when the file was not loaded. */
  readonly document: ConfigDocument;
  /** What reading the file found, for the status report's `Config:` block. */
  readonly file: ConfigFile;
  /**
   * A `showInactiveStatus` value that is not a boolean. Its warning names
   * the value that applies instead, which depends on the other scope, so
   * `loadPresetsConfig` words it.
   */
  readonly invalidShowInactiveStatus?: { readonly value: unknown };
  /**
   * The user file's compiled policy rules; always empty for the project
   * file.
   */
  readonly policyRules: readonly CompiledPolicyRule[];
  readonly presets: Preset[];
  readonly showInactiveStatus?: boolean;
  readonly warnings: ScopeWarnings;
}

/** Warnings grouped by the configuration section that produced them. */
export interface ScopeWarnings {
  readonly file: string[];
  readonly presets: string[];
  readonly policy: string[];
}

/**
 * Origin scope for a loaded preset. `"user"` is the global file under
 * `<agent-dir>/presets-plus/config.json`, and `"project"` is the per-cwd file
 * under `<cwd>/.pi/presets-plus/config.json`.
 */
export type PresetScope = "user" | "project";

/**
 * Every reasoning level a preset may declare.
 *
 * Mirrors the levels pi-coding-agent's `getThinkingLevel()` and
 * `setThinkingLevel()` accept, which extend `pi-ai`'s set with `"off"`.
 * Storage accepts all of them; activation checks the model's capabilities
 * before writing a level to Pi.
 */
export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

/** Reasoning level recorded on a preset. */
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
