/**
 * The `/rtk` command: turns command rewriting on or off, shows the status
 * report, and opens a menu of the same actions for a bare `/rtk`.
 */

import { EXTENSION_NAME } from "../extension-name.js";
import type { RtkRuntime } from "../runtime.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  createCommandReport,
  notifyUsageWarning,
  type SubcommandCompletion,
} from "@sherif-fanous/pi-extensions-core";

/** What `/rtk` needs besides its arguments and context. */
export interface RtkCommandDeps {
  readonly pi: ExtensionAPI;
  readonly runtime: RtkRuntime;
}

/**
 * The `/rtk` subcommands. The bare `/rtk` menu offers the same descriptions
 * as the completions, and maps the chosen one back to its subcommand.
 */
export const RTK_SUBCOMMANDS = [
  { description: "Rewrite shell commands with RTK", name: "enable" },
  { description: "Stop rewriting shell commands", name: "disable" },
  { description: "Show RTK status", name: "status" },
] as const satisfies readonly SubcommandCompletion[];

/** The `/rtk status` report, a transcript entry in the TUI. */
export const STATUS_REPORT = createCommandReport("rtk:status-report");

const RTK_USAGE_FORMS: readonly [string, ...string[]] = [
  "/rtk",
  ...RTK_SUBCOMMANDS.map(({ name }) => `/rtk ${name}`),
];

type RtkSubcommand = (typeof RTK_SUBCOMMANDS)[number]["name"];

/** Run `/rtk` with `args`. */
export async function runRtkCommand(
  args: string,
  ctx: ExtensionCommandContext,
  deps: RtkCommandDeps,
): Promise<void> {
  const subcommand = args.trim();

  // Print and JSON mode have no UI to open a menu in, so bare /rtk shows
  // the status report, its text equivalent. RPC clients get the menu.
  if (subcommand.length === 0) {
    if (ctx.hasUI) await showRtkOverlay(ctx, deps);
    else showRtkStatus(ctx, deps);

    return;
  }

  if (!isRtkSubcommand(subcommand)) {
    notifyUsageWarning(ctx, EXTENSION_NAME, subcommand, RTK_USAGE_FORMS);

    return;
  }

  handleRtkSubcommand(subcommand, ctx, deps);
}

function handleRtkSubcommand(
  subcommand: RtkSubcommand,
  ctx: ExtensionCommandContext,
  deps: RtkCommandDeps,
): void {
  if (subcommand === "status") {
    showRtkStatus(ctx, deps);

    return;
  }

  const enabled = subcommand === "enable";

  deps.runtime.setSessionEnabled(enabled, ctx);
  ctx.ui.notify(
    `Command rewriting ${enabled ? "enabled" : "disabled"}.`,
    "info",
  );
}

function isRtkSubcommand(value: string): value is RtkSubcommand {
  return RTK_SUBCOMMANDS.some(({ name }) => name === value);
}

async function showRtkOverlay(
  ctx: ExtensionCommandContext,
  deps: RtkCommandDeps,
): Promise<void> {
  const selected = await ctx.ui.select(
    deps.runtime.rtkStateText(),
    RTK_SUBCOMMANDS.map(({ description }) => description),
  );
  const subcommand = RTK_SUBCOMMANDS.find(
    ({ description }) => description === selected,
  );

  if (subcommand === undefined) return;

  handleRtkSubcommand(subcommand.name, ctx, deps);
}

function showRtkStatus(
  ctx: ExtensionCommandContext,
  { pi, runtime }: RtkCommandDeps,
): void {
  STATUS_REPORT.deliver(ctx, pi, { body: runtime.rtkStatusReport() });
}
