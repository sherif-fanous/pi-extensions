/**
 * Shows the system prompt of the active preset or of a preset named on
 * the command line, and explains itself when there is no prompt to show.
 */
import type { ActivePresetSession } from "../../activation/session.js";
import { EXTENSION_NAME } from "../../extension-name.js";
import type { HotkeyRegistry } from "../../hotkey-registry.js";
import { findPreset } from "../../preset-identity.js";
import { loadAll } from "../../store/api.js";
import type { ActivePresetState, LoadedPreset } from "../../types.js";
import { openInfoDialog } from "../../ui/info-dialog.js";
import { PROMPT_DIALOG_TITLE } from "../../ui/labels.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  isInteractiveTui,
  notifyWarnings,
} from "@sherif-fanous/pi-extensions-core";

/** Text and severity to display for one `show-prompt` invocation. */
export interface ShowPromptNotification {
  readonly body: string;
  readonly severity: "info" | "warning";
}

/** What `show-prompt` found: a prompt to display, or why there is none. */
export type ShowPromptResult =
  | { kind: "active"; preset: LoadedPresetWithPrompt }
  | { kind: "named"; preset: LoadedPresetWithPrompt }
  | { kind: "no-active" }
  | { kind: "no-prompt-active"; name: string }
  | { kind: "no-prompt-named"; name: string }
  | { kind: "unknown"; name: string };

/** A preset that carries a non-empty prompt. */
type LoadedPresetWithPrompt = LoadedPreset & { instructions: string };

/**
 * Decide what `show-prompt` should display. A name resolves against the
 * loaded presets with the project scope winning; without one, the active
 * preset decides.
 */
export function findPresetForShowPrompt(
  name: string | undefined,
  active: ActivePresetState | null | undefined,
  loaded: readonly LoadedPreset[],
): ShowPromptResult {
  if (name !== undefined) {
    const preset = findPresetByNameWithScopePrecedence(loaded, name);

    if (!preset) return { kind: "unknown", name };

    const promptPreset = presetWithPrompt(preset);

    if (!promptPreset) return { kind: "no-prompt-named", name: preset.name };

    return { kind: "named", preset: promptPreset };
  }

  if (!active) return { kind: "no-active" };

  const preset = findPreset(loaded, active);
  const activeName = preset?.name ?? active.name;
  const promptPreset = preset ? presetWithPrompt(preset) : undefined;

  if (!promptPreset) return { kind: "no-prompt-active", name: activeName };

  return { kind: "active", preset: promptPreset };
}

/** Turn a `show-prompt` result into the body text and severity to show. */
export function formatShowPromptBody(
  result: ShowPromptResult,
  theme?: Theme,
): ShowPromptNotification {
  void theme;

  switch (result.kind) {
    case "active":
    case "named":
      return { body: result.preset.instructions, severity: "info" };
    case "no-active":
      return { body: "No preset is active.", severity: "info" };
    case "no-prompt-active":
      return {
        body: `Active preset "${result.name}" has no prompt.`,
        severity: "info",
      };
    case "no-prompt-named":
      return {
        body: `Preset "${result.name}" has no prompt.`,
        severity: "info",
      };
    case "unknown":
      return {
        body: `No preset named "${result.name}".`,
        severity: "warning",
      };
  }
}

/**
 * Run `/presets show-prompt`. A prompt opens in a dialog under the TUI and
 * shows as a notification everywhere else; an answer without a prompt is a
 * notification, and an unknown name a warning. The arguments after the
 * subcommand form one preset name, because names may contain spaces.
 */
export async function runShowPrompt(
  ctx: ExtensionCommandContext,
  args: readonly string[],
  pi: ExtensionAPI,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  void pi;
  void hotkeys;

  const name = args.length > 0 ? args.join(" ") : undefined;
  const { presets } = await loadAll(ctx);
  const result = findPresetForShowPrompt(name, session.current(), presets);
  const notification = formatShowPromptBody(result, ctx.ui.theme);

  if (notification.severity === "warning") {
    notifyWarnings(ctx, EXTENSION_NAME, [notification.body]);

    return;
  }

  // No branch appends to the transcript. Inspecting a prompt must not copy
  // the preset instructions into the session.
  if (
    (result.kind !== "active" && result.kind !== "named") ||
    !isInteractiveTui(ctx) ||
    typeof ctx.ui.custom !== "function"
  ) {
    ctx.ui.notify(notification.body, notification.severity);

    return;
  }

  await openInfoDialog(ctx, {
    body: notification.body,
    title: PROMPT_DIALOG_TITLE,
  });
}

function findPresetByNameWithScopePrecedence(
  loaded: readonly LoadedPreset[],
  name: string,
): LoadedPreset | undefined {
  return (
    findPreset(loaded, { name, scope: "project" }) ??
    findPreset(loaded, { name, scope: "user" })
  );
}

/** Narrow a preset to one with a non-empty prompt, or return undefined. */
function presetWithPrompt(
  preset: LoadedPreset,
): LoadedPresetWithPrompt | undefined {
  if (
    preset.instructions === undefined ||
    preset.instructions.trim().length === 0
  ) {
    return undefined;
  }

  return { ...preset, instructions: preset.instructions };
}
