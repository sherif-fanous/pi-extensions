/**
 * Activates a preset: refuses one Pi can't run, works out the model,
 * thinking level, and tools to write, and hands them to the session.
 */
import type { LoadedPreset } from "../types.js";
import type { ActivePresetSession } from "./session.js";
import { effectiveThinkingLevel } from "./thinking.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Message that an apply produced alongside a successful activation. */
export interface ApplyNotice {
  readonly severity: "info" | "warning";
  readonly message: string;
}

/**
 * Outcome of an apply: success with any notices, or a refusal.
 *
 * The refusal kinds separate a preset that was already unavailable
 * (`no-key`, `no-model`), one naming a model the registry does not know
 * (`unknown-model`), and one whose model resolved but that `setModel`
 * rejected at apply time (`key-revoked`).
 */
export type ApplyResult =
  | {
      ok: true;
      applied?: boolean;
      notices?: readonly ApplyNotice[];
    }
  | {
      ok: false;
      kind: "key-revoked" | "no-key" | "no-model" | "unknown-model";
      reason: string;
    };

/**
 * Apply `preset` to Pi state.
 *
 * The result carries refusals and notices as data so each caller can surface
 * them through the channel that suits its context.
 */
export async function apply(
  preset: LoadedPreset,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<ApplyResult> {
  if (preset.unavailable) {
    const kind = preset.unavailable;

    return { ok: false, kind, reason: failureReason(kind, preset) };
  }

  if (session.isApplied(preset, ctx, pi)) {
    session.markClean(ctx);

    return { applied: false, notices: [], ok: true };
  }

  const model = ctx.modelRegistry.find(preset.provider, preset.model);

  if (!model) {
    return {
      ok: false,
      kind: "unknown-model",
      reason: failureReason("unknown-model", preset),
    };
  }

  const thinkingLevel = effectiveThinkingLevel(preset, model);
  const declared = preset.thinkingLevel ?? "off";
  const notices: ApplyNotice[] = [];

  if (thinkingLevel !== declared) {
    notices.push({
      message: `Thinking level changed from ${declared} to ${thinkingLevel} for preset "${preset.name}".`,
      severity: "info",
    });
  }

  let tools: string[] | undefined;

  if (preset.tools && preset.tools.length > 0) {
    const valid = filterValidTools(preset.tools, pi.getAllTools());
    const dropped = preset.tools.filter(
      (toolName) => !valid.includes(toolName),
    );

    if (dropped.length > 0) {
      notices.push({
        message: `Ignored unknown tools for preset "${preset.name}": ${dropped.join(", ")}.`,
        severity: "warning",
      });
    }

    tools = valid;
  }

  // The session commits the record before callers present the outcome, so
  // the footer and any related UI already show the new preset.
  if (
    !(await session.apply(preset, { model, thinkingLevel, tools }, ctx, pi))
  ) {
    return {
      ok: false,
      kind: "key-revoked",
      reason: failureReason("key-revoked", preset),
    };
  }

  return { applied: true, notices, ok: true };
}

function failureReason(
  kind: Exclude<ApplyResult, { ok: true }>["kind"],
  preset: Pick<LoadedPreset, "model" | "name" | "provider">,
): string {
  switch (kind) {
    case "no-key":
      return `Preset "${preset.name}" is unavailable because its provider has no API key. Pi did not activate it.`;
    case "no-model":
      return `Preset "${preset.name}" is unavailable because its model is not installed. Pi did not activate it.`;
    case "unknown-model":
      return `Preset "${preset.name}" references unknown model ${preset.provider}/${preset.model}.`;
    case "key-revoked":
      return `Pi has no API key configured for ${preset.provider}/${preset.model}.`;

    default: {
      const exhaustive: never = kind;

      return exhaustive;
    }
  }
}

function filterValidTools(
  desired: readonly string[],
  allTools: readonly { name: string }[],
): string[] {
  const available = new Set(allTools.map((tool) => tool.name));

  return desired.filter((toolName) => available.has(toolName));
}
