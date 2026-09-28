/**
 * Dispatches `/presets` invocations to the picker, to a subcommand, or to
 * activation by preset name, and answers the host's autocomplete requests
 * for the same argument.
 */
import { requestActivation } from "../../activation/request.js";
import type { ActivePresetSession } from "../../activation/session.js";
import { EXTENSION_NAME } from "../../extension-name.js";
import type { HotkeyRegistry } from "../../hotkey-registry.js";
import { loadAll } from "../../store/api.js";
import { notifyApplyResult } from "../../ui/apply-result.js";
import { openPicker } from "../../ui/picker.js";
import { runClear } from "./clear.js";
import { runPolicy } from "./policy.js";
import { runReload } from "./reload.js";
import { runShowPrompt } from "./show-prompt.js";
import { runStatus } from "./status.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import {
  notifyUsageWarning,
  requireInteractiveTui,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

/** What `/presets` and its subcommands need besides arguments and context. */
export interface PresetsCommandDeps {
  readonly hotkeys: HotkeyRegistry;
  readonly pi: ExtensionAPI;
  readonly session: ActivePresetSession;
}

/**
 * One `/presets` subcommand: the token, the description its completion
 * shows, whether a preset name may follow it, and its runner.
 */
interface Subcommand {
  /** A preset name may follow the token; other subcommands take nothing. */
  readonly acceptsName?: boolean;
  readonly description: string;
  readonly name: string;
  run(
    ctx: ExtensionCommandContext,
    args: readonly string[],
    deps: PresetsCommandDeps,
  ): Promise<void>;
}

/** Every subcommand, read by both autocomplete and dispatch. */
const SUBCOMMANDS: readonly Subcommand[] = [
  {
    name: "reload",
    description: "Reload presets from disk",
    run: (ctx, _args, { hotkeys, session }) => runReload(ctx, session, hotkeys),
  },
  {
    name: "clear",
    description: "Clear the active preset",
    run: (ctx, _args, { pi, session }) => runClear(ctx, pi, session),
  },
  {
    name: "status",
    description: "Show the active preset's status",
    run: (ctx, _args, { pi, session }) => runStatus(ctx, pi, session),
  },
  {
    name: "policy",
    description: "Show the preset policy for this directory",
    run: (ctx, _args, { pi }) => runPolicy(ctx, pi),
  },
  {
    name: "show-prompt",
    acceptsName: true,
    description: "Show a preset's prompt, the active one by default",
    run: (ctx, args, { session }) => runShowPrompt(ctx, args, session),
  },
] as const;

/** Completes the first word of the argument with a subcommand name. */
const completeSubcommand = subcommandCompletions(SUBCOMMANDS);
/** Every way to run `/presets`, listed by the usage warning. */
const USAGE_FORMS = [
  "/presets",
  ...SUBCOMMANDS.map((subcommand) => `/presets ${subcommand.name}`),
] as const satisfies readonly [string, ...string[]];

/**
 * Complete the argument after `/presets`: preset names once the user has
 * typed `show-prompt `, subcommand tokens otherwise.
 *
 * Pi replaces the whole argument with the completion value, so a name
 * completion carries the `show-prompt ` subcommand in front of the name.
 */
export async function getArgumentCompletions(
  prefix: string,
  getPresetNames: () => Promise<readonly string[]> = () => Promise.resolve([]),
): Promise<AutocompleteItem[]> {
  const trimmedPrefix = prefix.trimStart();
  const showPromptPrefix = "show-prompt ";

  if (trimmedPrefix.startsWith(showPromptPrefix)) {
    const namePrefix = trimmedPrefix.slice(showPromptPrefix.length).trimStart();
    const names = await getPresetNames();

    return names
      .filter((name) => name.startsWith(namePrefix))
      .map((name) => ({ label: name, value: `${showPromptPrefix}${name}` }));
  }

  return completeSubcommand(prefix) ?? [];
}

/**
 * Run a `/presets` invocation. An empty argument opens the picker, a
 * subcommand runs it, and any other argument is tried as a preset name
 * before the unknown-subcommand warning. A subcommand matches the whole
 * argument, except that `show-prompt` may be followed by a preset name.
 */
export async function runPresetsCommand(
  args: string,
  ctx: ExtensionCommandContext,
  deps: PresetsCommandDeps,
): Promise<void> {
  const trimmedArgs = args.trim();

  if (trimmedArgs.length === 0) {
    await runPicker(ctx, deps);

    return;
  }

  const [firstToken, ...rest] = trimmedArgs.split(/\s+/);

  // `list` was never a subcommand, and it stays out of preset-name lookup.
  if (firstToken === "list") {
    notifyUsageWarning(ctx, EXTENSION_NAME, trimmedArgs, USAGE_FORMS);

    return;
  }

  const target = SUBCOMMANDS.find(
    (subcommand) =>
      subcommand.name === trimmedArgs ||
      (subcommand.acceptsName === true && subcommand.name === firstToken),
  );

  if (target) {
    await target.run(ctx, rest, deps);

    return;
  }

  if (await activateNamedPreset(trimmedArgs, ctx, deps)) return;

  notifyUsageWarning(ctx, EXTENSION_NAME, trimmedArgs, USAGE_FORMS);
}

/** Activate a preset by name, returning false when no such preset exists. */
async function activateNamedPreset(
  name: string,
  ctx: ExtensionCommandContext,
  { pi, session }: PresetsCommandDeps,
): Promise<boolean> {
  const { config, presets } = await loadAll(ctx);
  const preset = presets.find(
    (candidate) => candidate.name === name && !candidate.shadowed,
  );

  // Load warnings show at session start and on /presets reload. They are
  // repeated only when the name is not loaded, since one may explain why.
  if (!preset) {
    config.notify(ctx);

    return false;
  }

  const result = await requestActivation(preset, ctx, pi, session);

  if (!result.ok && result.kind === "cancelled") return true;

  notifyApplyResult(ctx, preset, result);

  return true;
}

async function runPicker(
  ctx: ExtensionCommandContext,
  { hotkeys, pi, session }: PresetsCommandDeps,
): Promise<void> {
  // Outside the TUI, ui.custom resolves undefined and no picker can open.
  // The preset editor opens only from the picker, so this gates it too.
  if (!requireInteractiveTui(ctx, EXTENSION_NAME, "/presets")) return;

  await openPicker(ctx, {
    hotkeys,
    inheritedTools: pi.getActiveTools(),
    onActivate: async (preset) => {
      const result = await requestActivation(preset, ctx, pi, session);

      if (result.ok) notifyApplyResult(ctx, preset, result);

      return result;
    },
    pi,
    session,
  });
}
