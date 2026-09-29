/**
 * Activates the preset a trigger asks for: finds it, checks it against the
 * access policy, applies it, and shows the outcome the way that trigger
 * needs. Session start runs its restore, `--preset`, and policy-default
 * steps here too.
 */
import { EXTENSION_NAME } from "../extension-name.js";
import { readPresetFlag } from "../flag.js";
import { findPreset, findPresetByName } from "../preset-identity.js";
import { loadPresetsConfig, type PresetsConfig } from "../store/api.js";
import {
  isPermitted,
  resolveMatchingRules,
  resolvePolicyDefault,
  type PolicyRules,
} from "../store/policy.js";
import type { LoadedPreset, PresetScope } from "../types.js";
import { reportWarnings } from "../warnings.js";
import { apply, type ApplyNotice } from "./apply.js";
import type { ActivePresetSession } from "./session.js";
import {
  isAutomaticDefaultEligible,
  type StartupSelection,
} from "./startup-selection.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { notifyWarnings } from "@sherif-fanous/pi-extensions-core";

/** How an activation ended. */
export type ActivationOutcome = {
  /**
   * The warnings the `flag` trigger holds back for the startup
   * notification. Empty for every other trigger, which shows its own.
   */
  readonly warnings: readonly string[];
} & (
  | { readonly kind: "applied" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "unknown" }
);

/**
 * Which preset to activate and what asked for it. A `name` without a
 * `scope` means the project preset of that name, then the user one.
 */
export type ActivationRequest = {
  /**
   * The configuration this operation already read. Activation reads it
   * when absent.
   */
  readonly config?: PresetsConfig;
  readonly trigger: ActivationTrigger;
} & (
  | { readonly preset: LoadedPreset }
  | { readonly name: string; readonly scope?: PresetScope }
);

/**
 * What asked for an activation, which decides how its outcome is shown.
 *
 * - `command`: `/presets <name>`. A name it can't find shows the
 *   configuration's warnings, since one may explain why.
 * - `flag`: `--preset` at startup. Its warnings come back in the outcome
 *   for the startup notification.
 * - `hotkey`: a preset's shortcut.
 * - `picker`: the picker and the editor's Test. A refusal comes back
 *   without a notification, for the picker's own dialog.
 *
 * `flag` and `hotkey` name Presets Plus in the success message, since the
 * user didn't just type a command. A cancelled override is silent for all.
 */
export type ActivationTrigger = "command" | "flag" | "hotkey" | "picker";

/**
 * Activate the preset `request` asks for and show the outcome as its
 * trigger needs.
 */
export async function activate(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
  request: ActivationRequest,
): Promise<ActivationOutcome> {
  const { trigger } = request;
  const warnings: string[] = [];
  const collected = trigger === "flag" ? warnings : undefined;
  const config = request.config ?? (await loadPresetsConfig(ctx));
  const preset = "preset" in request ? request.preset : lookUp(config, request);

  if (!preset) {
    if ("name" in request) {
      showUnknown(ctx, config, request.name, trigger, collected);
    }

    return { kind: "unknown", warnings };
  }

  if (!(await passesPolicy(preset, config.policy, ctx))) {
    return { kind: "cancelled", warnings };
  }

  const result = await apply(preset, ctx, pi, session);

  if (!result.ok) {
    if (trigger !== "picker") ctx.ui.notify(result.reason, "error");

    return { kind: "refused", reason: result.reason, warnings };
  }

  if (result.applied !== false) {
    showApplied(
      ctx,
      preset,
      result.notices ?? [],
      trigger === "flag" || trigger === "hotkey",
      collected,
    );
  }

  return { kind: "applied", warnings };
}

/**
 * Attach or activate the session's preset at startup: the restored
 * session's preset, then the one `--preset` names, then, when neither
 * claimed the session, the access policy's default for the directory.
 *
 * Adds each step's warnings to `warnings` as it goes, so session start
 * shows them in its one notification even when a later step throws.
 */
export async function activateAtStartup(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
  config: PresetsConfig,
  startup: StartupSelection,
  warnings: string[],
): Promise<void> {
  const restored = session.restoreFromBranch(
    ctx.sessionManager.getBranch(),
    config.presets,
    ctx,
  );

  warnings.push(...restored.warnings);

  const name = readPresetFlag(pi);
  let flagApplied = false;

  if (name !== undefined) {
    const outcome = await activate(ctx, pi, session, {
      config,
      name,
      trigger: "flag",
    });

    warnings.push(...outcome.warnings);
    flagApplied = outcome.kind === "applied";
  }

  if (restored.state !== undefined || flagApplied) return;

  await applyPolicyDefault(ctx, pi, session, config, startup, warnings);
}

/**
 * Apply the access policy's default for the directory when this startup
 * may take one. A default that can't be applied is a warning, and the
 * session keeps Pi's own model and thinking level.
 */
async function applyPolicyDefault(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
  { policy, presets }: PresetsConfig,
  startup: StartupSelection,
  warnings: string[],
): Promise<void> {
  if (!isAutomaticDefaultEligible(startup, ctx)) return;

  const resolved = resolvePolicyDefault(ctx.cwd, presets, policy.rules);

  if (resolved.kind === "none") return;

  if (resolved.kind === "unresolvable") {
    warnings.push(
      `The default from rule ${resolved.winner.rule.index + 1} (${JSON.stringify(resolved.winner.rule.match)}) does not match any permitted preset that is available. Kept the baseline.`,
    );

    return;
  }

  const [preset] = resolved.candidates;
  const result = await apply(preset, ctx, pi, session);

  if (!result.ok) {
    warnings.push(result.reason);

    return;
  }

  if (result.applied !== false) {
    showApplied(ctx, preset, result.notices ?? [], true, warnings);
  }
}

/** List one entry per preset name for the unknown `--preset` warning. */
function formatAvailableNames(presets: readonly LoadedPreset[]): string {
  const byName = new Map<string, LoadedPreset>();

  for (const preset of presets) {
    const existing = byName.get(preset.name);

    if (!existing || existing.shadowed) byName.set(preset.name, preset);
  }

  if (byName.size === 0) return "none";

  return [...byName.values()]
    .map((preset) =>
      preset.unavailable
        ? `${preset.name} (Unavailable: ${preset.unavailable})`
        : preset.name,
    )
    .join(", ");
}

/**
 * Find the preset a named request means: that exact identity when it
 * gives a scope, and otherwise the project preset, then the user one.
 */
function lookUp(
  { presets }: PresetsConfig,
  request: { readonly name: string; readonly scope?: PresetScope },
): LoadedPreset | undefined {
  return request.scope === undefined
    ? findPresetByName(presets, request.name)
    : findPreset(presets, { name: request.name, scope: request.scope });
}

/**
 * Whether `policy` permits `preset` here, or the user confirms activating
 * it anyway.
 */
async function passesPolicy(
  preset: LoadedPreset,
  policy: PolicyRules,
  ctx: Pick<ExtensionContext, "cwd" | "mode" | "ui">,
): Promise<boolean> {
  if (isPermitted(preset, resolveMatchingRules(ctx.cwd, policy.rules))) {
    return true;
  }

  const { openPolicyOverride } = await import("../ui/policy-overlay.js");

  return openPolicyOverride(ctx, preset);
}

/**
 * Show a successful activation: one info notification that folds in the
 * info notices, then the warning notices, collected into `warnings` when
 * given and otherwise notified. `unprompted` names Presets Plus as the
 * subject, for an activation the user didn't just ask for.
 */
function showApplied(
  ctx: Pick<ExtensionContext, "ui">,
  preset: Pick<LoadedPreset, "name">,
  notices: readonly ApplyNotice[],
  unprompted: boolean,
  warnings: string[] | undefined,
): void {
  const body = [
    unprompted
      ? `${EXTENSION_NAME} applied preset "${preset.name}".`
      : `Preset "${preset.name}" applied.`,
    ...notices
      .filter((notice) => notice.severity === "info")
      .map((notice) => notice.message),
  ].join("\n");

  ctx.ui.notify(body, "info");
  reportWarnings(
    ctx,
    notices
      .filter((notice) => notice.severity === "warning")
      .map((notice) => notice.message),
    warnings,
  );
}

/** Tell the user a named request found no preset, as `trigger` needs. */
function showUnknown(
  ctx: ExtensionContext,
  { config, presets }: PresetsConfig,
  name: string,
  trigger: ActivationTrigger,
  warnings: string[] | undefined,
): void {
  switch (trigger) {
    case "command":
    case "picker":
      config.notify(ctx);

      return;
    case "flag":
      reportWarnings(
        ctx,
        [
          `Unknown preset "${name}" for --preset. Available: ${formatAvailableNames(presets)}.`,
        ],
        warnings,
      );

      return;
    case "hotkey":
      notifyWarnings(ctx, EXTENSION_NAME, [
        `Preset "${name}" no longer exists.`,
      ]);
  }
}
