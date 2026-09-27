/**
 * Dispatches `/presets` invocations to the picker, to a subcommand, or to
 * activation by preset name, and answers the host's autocomplete requests
 * for the same argument.
 */
import { clear } from "../../activation/clear.js";
import { requestActivation } from "../../activation/request.js";
import type { ActivePresetSession } from "../../activation/session.js";
import type { HotkeyRegistry } from "../../hotkey-registry.js";
import { loadAll } from "../../store/api.js";
import { notifyApplyResult } from "../../ui/apply-result.js";
import { openPicker } from "../../ui/picker.js";
import { runPolicy } from "./policy.js";
import { runReload } from "./reload.js";
import { runShowPrompt } from "./show-prompt.js";
import { runStatus } from "./status.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  notifyWarnings,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

/**
 * One `/presets` subcommand: the token, the description its completion
 * label shows, and its runner.
 */
interface Subcommand {
  readonly description: string;
  readonly name: string;
  run(
    ctx: ExtensionCommandContext,
    args: readonly string[],
    pi: ExtensionAPI | undefined,
    session: ActivePresetSession,
    hotkeys: HotkeyRegistry,
  ): Promise<void>;
}

/** Every subcommand, read by both autocomplete and dispatch. */
const SUBCOMMANDS: readonly Subcommand[] = [
  {
    name: "reload",
    description: "re-read both scope files",
    run: runReloadWrapper,
  },
  {
    name: "clear",
    description: "clear the active preset",
    run: runClearWrapper,
  },
  {
    name: "status",
    description: "show active preset details",
    run: runStatusWrapper,
  },
  {
    name: "policy",
    description: "show access policy for this directory",
    run: runPolicyWrapper,
  },
  {
    name: "show-prompt",
    description: "show the active preset's prompt (or [name])",
    run: runShowPrompt,
  },
] as const;

/** Completes the first word of the argument with a subcommand name. */
const completeSubcommand = subcommandCompletions(SUBCOMMANDS);

/**
 * Complete the argument after `/presets`: preset names once the user has
 * typed `show-prompt `, subcommand tokens otherwise.
 */
export async function getArgumentCompletions(
  prefix: string,
  getPresetNames: () => Promise<readonly string[]> = () => Promise.resolve([]),
): Promise<{ value: string; label: string }[]> {
  const trimmedPrefix = prefix.trimStart();
  const showPromptPrefix = "show-prompt ";

  if (trimmedPrefix.startsWith(showPromptPrefix)) {
    const namePrefix = trimmedPrefix.slice(showPromptPrefix.length).trimStart();
    const names = await getPresetNames();

    return names
      .filter((name) => name.startsWith(namePrefix))
      .map((name) => ({ label: name, value: name }));
  }

  return completeSubcommand(prefix) ?? [];
}

/**
 * Run a `/presets` invocation. An empty argument opens the picker, a known
 * subcommand runs it, and any other token is tried as a preset name before
 * the unknown-subcommand warning.
 */
export async function handlePresetsCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  const trimmedArgs = args.trim();

  if (trimmedArgs.length === 0) {
    await runPicker(ctx, pi, session, hotkeys);

    return;
  }

  const tokens = trimmedArgs.split(/\s+/);
  const subCommand = tokens[0] ?? "";

  if (subCommand === "list") {
    notifyWarnings(ctx, "Presets Plus", [
      '"list" is not a supported /presets subcommand. Run /presets to open the picker.',
    ]);

    return;
  }

  const target = SUBCOMMANDS.find(
    (subcommand) => subcommand.name === subCommand,
  );

  if (target) {
    await target.run(ctx, tokens.slice(1), pi, session, hotkeys);

    return;
  }

  if (pi && (await activateNamedPreset(trimmedArgs, ctx, pi, session))) return;

  notifyWarnings(ctx, "Presets Plus", [
    `Unknown subcommand "${subCommand ?? ""}". Try ${formatSupportedCommandHint()}.`,
  ]);
}

/** Activate a preset by name, returning false when no such preset exists. */
async function activateNamedPreset(
  name: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<boolean> {
  const { presets, warnings } = await loadAll(ctx);

  notifyWarnings(ctx, "Presets Plus", warnings);

  const preset = presets.find(
    (candidate) => candidate.name === name && !candidate.shadowed,
  );

  if (!preset) return false;

  const result = await requestActivation(preset, ctx, pi, session);

  if (!result.ok && result.kind === "cancelled") return true;

  notifyApplyResult(ctx, preset, result);

  return true;
}

/** List the supported commands for the unknown-subcommand warning. */
function formatSupportedCommandHint(): string {
  const commands = [
    "/presets",
    ...SUBCOMMANDS.map((subcommand) => `/presets ${subcommand.name}`),
  ];

  if (commands.length <= 1) return commands[0] ?? "/presets";

  return `${commands.slice(0, -1).join(", ")}, or ${commands[commands.length - 1]}`;
}

async function runClearWrapper(
  ctx: ExtensionCommandContext,
  _args: readonly string[],
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  void hotkeys;
  if (!pi) return;
  await clear(ctx, pi, session);
}

async function runPicker(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  if (!pi) {
    notifyWarnings(ctx, "Presets Plus", [
      "Preset picker is only available in interactive mode.",
    ]);

    return;
  }

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

async function runPolicyWrapper(
  ctx: ExtensionCommandContext,
  _args: readonly string[],
  pi: ExtensionAPI | undefined,
  _session: ActivePresetSession,
  _hotkeys: HotkeyRegistry,
): Promise<void> {
  void _session;
  void _hotkeys;

  if (!pi) return;
  await runPolicy(ctx, pi);
}

async function runReloadWrapper(ctx: ExtensionCommandContext): Promise<void> {
  await runReload(ctx);
}

async function runStatusWrapper(
  ctx: ExtensionCommandContext,
  _args: readonly string[],
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  void hotkeys;
  if (!pi) return;
  await runStatus(ctx, pi, session);
}
