/**
 * The `/slice` command: checks the session can be sliced, asks for the start
 * and end boundaries, writes the slice, and switches to it.
 */

import { EXTENSION_NAME } from "../extension-name.js";
import {
  listCandidates,
  sliceSession,
  unsupportedSourceReason,
  type SliceSessionResult,
} from "../slice.js";
import { showEndPicker, showStartPicker } from "../ui/picker.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  describeErrorSentence,
  notifyUsageWarning,
  notifyWarnings,
  pluralize,
  requireInteractiveTui,
} from "@sherif-fanous/pi-extensions-core";

/** Run `/slice` with `args`, which must be empty. */
export async function runSliceCommand(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  // /slice takes no argument, so any argument is a usage mistake.
  if (args.trim() !== "") {
    notifyUsageWarning(ctx, EXTENSION_NAME, args, ["/slice"]);

    return;
  }

  await runSliceFlow(ctx);
}

/** Run the interactive session-slice flow. */
async function runSliceFlow(ctx: ExtensionCommandContext): Promise<void> {
  // Outside the TUI, ui.custom resolves undefined and no picker can open.
  if (!requireInteractiveTui(ctx, EXTENSION_NAME, "/slice")) return;

  // Pi assigns the path at session creation and defers the first write; like
  // /fork, slicing only records the path as parentSession and never reads it.
  if (!ctx.sessionManager.getSessionFile()) {
    notifyWarnings(ctx, EXTENSION_NAME, [
      "Slicing needs a session file to switch to, but Pi was started with --no-session.",
    ]);

    return;
  }

  if (!ctx.isIdle()) {
    notifyWarnings(ctx, EXTENSION_NAME, [
      "The agent is still running. Wait for it to finish before slicing.",
    ]);

    return;
  }

  const unsupportedReason = unsupportedSourceReason(ctx.sessionManager);

  if (unsupportedReason !== undefined) {
    notifyWarnings(ctx, EXTENSION_NAME, [unsupportedReason]);

    return;
  }

  const candidates = listCandidates(ctx.sessionManager);

  if (candidates.length === 0) {
    notifyWarnings(ctx, EXTENSION_NAME, [
      "This session has no user messages yet, so there is nothing to slice.",
    ]);

    return;
  }

  const start = await showStartPicker(ctx.ui, candidates);

  if (start.kind === "cancel") return;

  const end = await showEndPicker(ctx.ui, candidates, start.candidate.ordinal);

  if (end.kind === "cancel") return;

  const endCandidate = end.kind === "message" ? end.candidate : undefined;
  let result: SliceSessionResult;

  try {
    result = sliceSession(ctx.sessionManager, {
      startId: start.candidate.id,
      endId: endCandidate?.id,
    });
  } catch (error) {
    ctx.ui.notify(
      `Could not create the sliced session: ${describeErrorSentence(error)}`,
      "error",
    );

    return;
  }

  if ("reason" in result) {
    notifyWarnings(ctx, EXTENSION_NAME, [result.reason]);

    return;
  }

  // The original ctx is stale once the switch completes. The ctx passed to
  // withSession belongs to the new session and stays valid, so keep it for the
  // success message, which must come after Pi's own "Resumed session" status
  // or that status replaces it.
  let sliceCtx: ExtensionCommandContext | undefined;

  const switched = await ctx.switchSession(result.path, {
    withSession: (newCtx) => {
      sliceCtx = newCtx;

      if (endCandidate) newCtx.ui.setEditorText(endCandidate.text);

      return Promise.resolve();
    },
  });

  if (switched.cancelled) {
    notifyWarnings(ctx, EXTENSION_NAME, [
      `The sliced session was saved at ${result.path}, but Pi did not switch to it.`,
    ]);

    return;
  }

  sliceCtx?.ui.notify(
    `Sliced ${pluralize(result.copied, "entry", "entries")} into a new session.`,
    "info",
  );
}
