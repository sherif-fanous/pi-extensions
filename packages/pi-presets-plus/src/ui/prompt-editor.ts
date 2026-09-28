/**
 * Opens Pi's built-in text editor on a preset's instructions, giving it a
 * preset-specific title.
 */
import { PROMPT_EDITOR_TITLE } from "./labels.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Starting text and the preset name that titles the editor. */
export interface PromptEditorOptions {
  readonly initialText: string;
  readonly presetName: string | undefined;
}

/** Edited text, or a marker that the user left the editor without saving. */
export type PromptEditorResult =
  { confirmed: true; text: string } | { confirmed: false };

/** Edit the preset instructions and resolve with the user's choice. */
export async function openPromptEditor(
  ctx: Pick<ExtensionCommandContext, "ui">,
  options: PromptEditorOptions,
): Promise<PromptEditorResult> {
  const text = await ctx.ui.editor(
    promptEditorTitle(options),
    options.initialText,
  );

  return text === undefined ? { confirmed: false } : { confirmed: true, text };
}

/** Title the editor with the preset name, in double quotes, once the form has one. */
export function promptEditorTitle(
  options: Pick<PromptEditorOptions, "presetName">,
): string {
  const name = options.presetName?.trim();

  return name ? `${PROMPT_EDITOR_TITLE} for "${name}"` : PROMPT_EDITOR_TITLE;
}
