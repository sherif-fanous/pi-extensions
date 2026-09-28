/**
 * The two paths RTK rewrites shell commands on: the agent's `bash` tool, which
 * RTK replaces, and the user's `!<cmd>` commands. Every failure to rewrite
 * runs the original command.
 */

import type { RtkRuntime, RtkUiContext } from "./runtime.js";
import {
  createBashTool,
  createLocalBashOperations,
  type UserBashEvent,
  type UserBashEventResult,
} from "@earendil-works/pi-coding-agent";

/** A `bash` tool that runs rtk's rewrite of each command while rewriting is on. */
export function createRewritingBashTool(
  runtime: RtkRuntime,
): ReturnType<typeof createBashTool> {
  return createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd, env }) => ({
      command: runtime.rewriteIfEnabled(command) ?? command,
      cwd,
      env,
    }),
  });
}

/**
 * Create the `user_bash` handler. It returns operations that run rtk's
 * rewrite of a `!<cmd>` command, or nothing so Pi runs the command itself.
 * `!!<cmd>` commands are left alone, so their output stays out of the
 * model's context as the user chose.
 */
export function createUserBashRewriter(
  runtime: RtkRuntime,
): (
  event: UserBashEvent,
  ctx: RtkUiContext,
) => undefined | UserBashEventResult {
  const localBashOperations = createLocalBashOperations();

  return (event, ctx) => {
    runtime.setNotifyContext(ctx);

    if (event.excludeFromContext) return undefined;

    const rewritten = runtime.rewriteIfEnabled(event.command);

    if (rewritten === undefined) return undefined;

    return {
      operations: {
        exec: (_command, cwd, options) =>
          localBashOperations.exec(rewritten, cwd, options),
      },
    };
  };
}
