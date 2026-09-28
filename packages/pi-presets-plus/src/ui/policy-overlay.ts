/**
 * Asks the user to confirm an activation that the directory's access
 * policy does not permit.
 */
import type { LoadedPreset } from "../types.js";
import { openConfirm } from "./confirm.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isInteractiveTui } from "@sherif-fanous/pi-extensions-core";

/** Title of the override confirmation. */
const POLICY_OVERRIDE_TITLE = "Preset Doesn't Match Policy";

/**
 * Ask whether a policy-discouraged activation should proceed.
 *
 * Outside the TUI no overlay can open, so the question goes through Pi's
 * own confirm prompt: an RPC client answers it, and print and JSON mode
 * decline it.
 */
export async function openPolicyOverride(
  ctx: Pick<ExtensionContext, "mode" | "ui">,
  preset: Pick<LoadedPreset, "name">,
): Promise<boolean> {
  const message = `The access policy for this directory does not permit preset "${preset.name}". Activate it anyway?`;

  if (!isInteractiveTui(ctx)) {
    return ctx.ui.confirm(POLICY_OVERRIDE_TITLE, message);
  }

  return openConfirm(ctx, POLICY_OVERRIDE_TITLE, message, {
    no: "Cancel",
    yes: "Override",
  });
}
