/**
 * Loads and validates one consolidated version 2 configuration document.
 * Section warnings preserve fail-open reads while marking the document unsafe to rewrite.
 */
import { readFile } from "node:fs/promises";

import type {
  Preset,
  PresetScope,
  ScopeConfig,
  ScopeWarnings,
} from "../types.js";
import { parsePresetArray } from "./load.js";
import { getGlobalConfigPath, getProjectConfigPath } from "./paths.js";
import {
  isNotFoundError,
  isRecord,
  malformedConfigWarning,
  parseJsonObject,
  unreadableConfigWarning,
} from "@sherif-fanous/pi-extensions-core";

/** File-system seam used by scope loading tests. */
export interface ConfigFs {
  readonly readFile: typeof readFile;
}

const defaultFs: ConfigFs = { readFile };

/** Load one scope's complete version 2 document and validated preset section. */
export async function loadScope(
  scope: PresetScope,
  cwd: string,
  agentDir?: string,
  fs: ConfigFs = defaultFs,
): Promise<ScopeConfig> {
  const path =
    scope === "user"
      ? getGlobalConfigPath(agentDir)
      : getProjectConfigPath(cwd);
  let rawData: string;

  try {
    rawData = await fs.readFile(path, "utf-8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        document: { version: 2 },
        presets: [],
        warnings: emptyWarnings(),
      };
    }

    return invalidScope(unreadableConfigWarning(path, error));
  }

  const parsedResult = parseJsonObject(rawData);

  if (!parsedResult.ok) {
    return invalidScope(malformedConfigWarning(path, parsedResult));
  }

  const parsed = parsedResult.value;

  if (parsed.version !== 2) {
    return invalidScope(
      `Configuration at ${path} uses unsupported version ${JSON.stringify(parsed.version)}; expected 2. Ignored the file.`,
    );
  }

  const document = parsed as ScopeConfig["document"];
  const warnings = emptyWarnings();
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
    presets,
    ...(showInactiveStatus === undefined ? {} : { showInactiveStatus }),
    ...(invalidShowInactiveStatus === undefined
      ? {}
      : { invalidShowInactiveStatus }),
    warnings,
  };
}

function emptyWarnings(): ScopeWarnings {
  return { file: [], presets: [], policy: [] };
}

function invalidScope(warning: string): ScopeConfig {
  return {
    document: { version: 2 },
    presets: [],
    warnings: { ...emptyWarnings(), file: [warning] },
  };
}
