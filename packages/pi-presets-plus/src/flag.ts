/**
 * Registers the `--preset` command-line flag and reads the preset name it
 * was given.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Name of the command-line flag, without the leading dashes. */
const PRESET_FLAG = "preset";

/**
 * The preset name `--preset` was given, trimmed, or `undefined` when the
 * flag is absent or blank.
 */
export function readPresetFlag(
  pi: Pick<ExtensionAPI, "getFlag">,
): string | undefined {
  const value = pi.getFlag(PRESET_FLAG);

  if (typeof value !== "string") return undefined;

  const name = value.trim();

  return name.length === 0 ? undefined : name;
}

/** Declare the `--preset` flag so Pi accepts and parses it. */
export function registerPresetFlag(
  pi: Pick<ExtensionAPI, "registerFlag">,
): void {
  pi.registerFlag(PRESET_FLAG, {
    description: "Activate the named Presets Plus preset at startup",
    type: "string",
  });
}
