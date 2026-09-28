/**
 * The `/slice` command: checks the session can be sliced, asks for the start
 * and end boundaries, writes the slice, and switches to it.
 */

import { EXTENSION_NAME } from "../extension-name.js";
import {
  buildSlice,
  listCandidates,
  SUPPORTED_SESSION_VERSION,
  writeSliceFile,
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
  const sourcePath = ctx.sessionManager.getSessionFile();

  if (!sourcePath) {
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

  const header = ctx.sessionManager.getHeader();

  if (header?.version !== SUPPORTED_SESSION_VERSION) {
    notifyWarnings(ctx, EXTENSION_NAME, [
      `This session uses unsupported format version ${String(header?.version ?? "unknown")}.`,
    ]);

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

  if (start.kind !== "message") return;

  const startCandidate = candidates.find(
    (candidate) => candidate.id === start.id,
  );

  if (!startCandidate) {
    notifyWarnings(ctx, EXTENSION_NAME, [
      "The selected start message is no longer available.",
    ]);

    return;
  }

  const end = await showEndPicker(ctx.ui, candidates, startCandidate.ordinal);

  if (end.kind === "cancel") return;

  const endId = end.kind === "message" ? end.id : null;
  const endText =
    end.kind === "message"
      ? candidates.find((candidate) => candidate.id === end.id)?.text
      : undefined;
  const result = buildSlice(ctx.sessionManager.getBranch(), start.id, endId);

  if ("reason" in result) {
    notifyWarnings(ctx, EXTENSION_NAME, [result.reason]);

    return;
  }

  let destination: string;

  try {
    destination = writeSliceFile(
      ctx.sessionManager.getSessionDir(),
      ctx.sessionManager.getCwd(),
      sourcePath,
      result.entries,
    );
  } catch (error) {
    ctx.ui.notify(
      `Could not create the sliced session: ${describeErrorSentence(error)}`,
      "error",
    );

    return;
  }

  // The original ctx is stale once the switch completes. The ctx passed to
  // withSession belongs to the new session and stays valid, so keep it for the
  // success message, which must come after Pi's own "Resumed session" status
  // or that status replaces it.
  let sliceCtx: ExtensionCommandContext | undefined;

  const switched = await ctx.switchSession(destination, {
    withSession: (newCtx) => {
      sliceCtx = newCtx;

      if (endText !== undefined) newCtx.ui.setEditorText(endText);

      return Promise.resolve();
    },
  });

  if (switched.cancelled) {
    notifyWarnings(ctx, EXTENSION_NAME, [
      `The sliced session was saved at ${destination}, but Pi did not switch to it.`,
    ]);

    return;
  }

  sliceCtx?.ui.notify(
    `Sliced ${pluralize(result.copiedCount, "entry", "entries")} into a new session.`,
    "info",
  );
}
