/**
 * Describes Presets Plus's `config.json` and validates one scope's file.
 * Section warnings preserve fail-open reads while marking the document unsafe to rewrite.
 */
import { EXTENSION_NAME } from "../extension-name.js";
import type {
  ConfigDocument,
  Preset,
  PresetScope,
  ScopeConfig,
  ScopeWarnings,
} from "../types.js";
import { parsePresetArray } from "./load.js";
import {
  defineConfigFile,
  isRecord,
  type ConfigFile,
} from "@sherif-fanous/pi-extensions-core";

/** The `version` this release reads and writes. */
export const CONFIG_VERSION = 2;

/** The value of every setting that no scope sets. */
export const DEFAULT_CONFIG = { showInactiveStatus: true } as const;

/** The version 1 file of presets in each scope's directory. */
export const LEGACY_PRESETS_FILE_NAME = "presets.json";

/**
 * Presets Plus's User and Project `config.json`. A version 1
 * `presets.json` the migration left in an untrusted project is reported
 * as the skipped project file, since it is still project configuration.
 */
export const PRESETS_PLUS_CONFIG = defineConfigFile({
  extension: "presets-plus",
  extensionName: EXTENSION_NAME,
  legacyFileNames: [LEGACY_PRESETS_FILE_NAME],
  scopes: ["user", "project"],
  version: CONFIG_VERSION,
});

/** Validate one scope's file: its document, settings, presets, and policy section. */
export function parseScope(scope: PresetScope, file: ConfigFile): ScopeConfig {
  const warnings: ScopeWarnings = {
    file:
      file.state === "invalid" || file.state === "untrusted"
        ? [file.warning]
        : [],
    presets: [],
    policy: [],
  };

  if (file.state !== "loaded")
    return { document: {}, file, presets: [], warnings };

  const { path } = file;
  const document = file.data as ConfigDocument;
  let showInactiveStatus: boolean | undefined;
  let invalidShowInactiveStatus: { value: unknown } | undefined;

  if (document.showInactiveStatus !== undefined) {
    if (typeof document.showInactiveStatus !== "boolean") {
      invalidShowInactiveStatus = { value: document.showInactiveStatus };
    } else {
      showInactiveStatus = document.showInactiveStatus;
    }
  }

  let presets: Preset[] = [];

  if (document.presets !== undefined) {
    if (!Array.isArray(document.presets)) {
      warnings.presets.push(
        `The config file ${path} has an invalid "presets" value; expected an array.`,
      );
    } else {
      const result = parsePresetArray(document.presets, path);

      presets = result.presets;
      warnings.presets.push(...result.warnings);
    }
  }

  if (scope === "project" && document.policy !== undefined) {
    warnings.policy.push(
      `The project config file ${path} contains policy, but policy is supported only in the user configuration.`,
    );
  } else if (scope === "user" && document.policy !== undefined) {
    if (!isRecord(document.policy) || !Array.isArray(document.policy.rules)) {
      warnings.policy.push(
        `The config file ${path} has an invalid "policy" section; expected an object with a "rules" array.`,
      );
    }
  }

  return {
    document,
    file,
    presets,
    ...(showInactiveStatus === undefined ? {} : { showInactiveStatus }),
    ...(invalidShowInactiveStatus === undefined
      ? {}
      : { invalidShowInactiveStatus }),
    warnings,
  };
}
