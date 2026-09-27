/**
 * Routes the warnings one step of an operation found, so an operation that
 * runs several steps, such as session startup, can show them all in one
 * notification.
 */
import {
  notifyWarnings,
  type GuardContext,
} from "@sherif-fanous/pi-extensions-core";

/**
 * Add `found` to `warnings` when the caller collects them, or otherwise
 * show `found` as one Presets Plus warning notification.
 */
export function reportWarnings(
  ctx: GuardContext,
  found: readonly string[],
  warnings: string[] | undefined,
): void {
  if (warnings) {
    warnings.push(...found);

    return;
  }

  notifyWarnings(ctx, "Presets Plus", found);
}
