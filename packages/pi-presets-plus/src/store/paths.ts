/**
 * Resolves the version 1 files the startup migration reads, which sit
 * beside each scope's `config.json`.
 */
import { dirname, join } from "node:path";

import type { PresetScope } from "../types.js";
import { LEGACY_PRESETS_FILE_NAME, PRESETS_PLUS_CONFIG } from "./config.js";
import type { ConfigContext } from "@sherif-fanous/pi-extensions-core";

/** File name for the legacy user access policy. */
const POLICY_FILE_NAME = "policy.json";

/** Absolute path to one scope's legacy preset file. */
export function getLegacyPresetsPath(
  ctx: Pick<ConfigContext, "cwd">,
  scope: PresetScope,
): string {
  return besideConfig(ctx, scope, LEGACY_PRESETS_FILE_NAME);
}

/** Absolute path to the user-scope legacy policy file. */
export function getUserPolicyPath(ctx: Pick<ConfigContext, "cwd">): string {
  return besideConfig(ctx, "user", POLICY_FILE_NAME);
}

/** Absolute path to `file` in the directory of one scope's `config.json`. */
function besideConfig(
  ctx: Pick<ConfigContext, "cwd">,
  scope: PresetScope,
  file: string,
): string {
  return join(dirname(PRESETS_PLUS_CONFIG.path(ctx, scope)), file);
}
