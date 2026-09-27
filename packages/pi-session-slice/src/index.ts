/** Registers `/slice` and coordinates boundary selection and session switching. */

import { showEndPicker, showStartPicker } from "./picker.js";
import {
  buildSlice,
  listCandidates,
  SUPPORTED_SESSION_VERSION,
  writeSliceFile,
} from "./slice.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  describeError,
  guardCommand,
  notifyWarnings,
} from "@sherif-fanous/pi-extensions-core";

/** Run the interactive session-slice flow. */
export async function handleSliceCommand(
  ctx: ExtensionCommandContext,
): Promise<void> {
  // Pi assigns the path at session creation and defers the first write; like
  // /fork, slicing only records the path as parentSession and never reads it.
  const sourcePath = ctx.sessionManager.getSessionFile();

  if (!sourcePath) {
    notifyWarnings(ctx, "Session Slice", [
      "Slicing needs a session file to switch to, but Pi was started with --no-session.",
    ]);

    return;
  }

  if (!ctx.isIdle()) {
    notifyWarnings(ctx, "Session Slice", [
      "The agent is still running. Wait for it to finish before slicing.",
    ]);

    return;
  }

  const header = ctx.sessionManager.getHeader();

  if (header?.version !== SUPPORTED_SESSION_VERSION) {
    notifyWarnings(ctx, "Session Slice", [
      `This session uses unsupported format version ${String(header?.version ?? "unknown")}.`,
    ]);

    return;
  }

  const candidates = listCandidates(ctx.sessionManager);

  if (candidates.length === 0) {
    notifyWarnings(ctx, "Session Slice", [
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
    notifyWarnings(ctx, "Session Slice", [
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
    notifyWarnings(ctx, "Session Slice", [result.reason]);

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
      `Could not create the sliced session: ${describeError(error)}.`,
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
    notifyWarnings(ctx, "Session Slice", [
      `The sliced session was saved at ${destination}, but Pi did not switch to it.`,
    ]);

    return;
  }

  sliceCtx?.ui.notify(
    `Sliced ${result.copiedCount} entries into a new session.`,
    "info",
  );
}

/** Register the session-slice command. */
export default function sessionSlice(pi: ExtensionAPI): void {
  pi.registerCommand("slice", {
    description: "Start a new session from a range of this one",
    handler: guardCommand("Session Slice", (_args, ctx) =>
      handleSliceCommand(ctx),
    ),
  });
}
