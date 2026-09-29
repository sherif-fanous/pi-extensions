/**
 * Extension entry point. Registers the rewriting `bash` tool, the `/rtk`
 * command, and the handlers that probe rtk at session start and rewrite the
 * user's `!<cmd>` commands.
 *
 * Rewriting is best-effort: when `rtk rewrite` fails, times out, or rtk is
 * unavailable, Pi runs the original command.
 */

import {
  RTK_SUBCOMMANDS,
  runRtkCommand,
  STATUS_REPORT,
} from "./commands/rtk.js";
import { EXTENSION_NAME } from "./extension-name.js";
import { createRtkRuntime } from "./runtime.js";
import { createRewritingBashTool, createUserBashRewriter } from "./shell.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  guardCommand,
  onEvent,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

/** Register RTK with the Pi host. */
export default function rtk(pi: ExtensionAPI): void {
  const runtime = createRtkRuntime();
  const rewriteUserBash = createUserBashRewriter(runtime);

  pi.registerTool(createRewritingBashTool(runtime));
  STATUS_REPORT.register(pi);
  pi.registerCommand("rtk", {
    description: "Turn RTK command rewriting on or off, or show its status",
    getArgumentCompletions: subcommandCompletions(RTK_SUBCOMMANDS),
    handler: guardCommand(EXTENSION_NAME, (args, ctx) =>
      runRtkCommand(args, ctx, { pi, runtime }),
    ),
  });

  onEvent(pi, EXTENSION_NAME, "session_start", (_event, ctx) => {
    runtime.startSession(ctx);
  });

  // A failure here resolves to no result, so Pi runs the command itself.
  onEvent(pi, EXTENSION_NAME, "user_bash", rewriteUserBash);
}
