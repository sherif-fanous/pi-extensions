/**
 * Turns Pi model, thinking level, and turn events into dirty-state updates
 * for the active preset, from the session's in-memory assessment so the
 * per-turn work never reads the preset files.
 */
import type { ActivePresetSession } from "./session.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Minimal model_select event surface needed for drift handling. */
interface ModelSelectLikeEvent {
  model: { id: string; provider: string };
  source: "cycle" | "restore" | "set";
}

/** Minimal context surface needed for drift comparison and status refresh. */
type DriftHandlerContext = Pick<
  ExtensionContext,
  "model" | "modelRegistry" | "ui"
>;

/** Minimal Pi surface needed for full-state drift sync. */
type DriftHandlerPi = Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">;

/**
 * Handle `model_select` by re-evaluating drift, ignoring the session's own
 * writes and session restores.
 *
 * The recheck covers every dimension even when the chosen model matches the
 * preset, because a drifted thinking level or tool set would otherwise show
 * a clean badge until the next `turn_start`.
 */
export function handleModelSelectDrift(
  event: ModelSelectLikeEvent,
  ctx: DriftHandlerContext,
  pi: DriftHandlerPi,
  session: ActivePresetSession,
): void {
  if (session.isSelfTriggered()) return;
  if (event.source === "restore") return;

  syncDirtyFromCurrentState(ctx, pi, session);
}

/**
 * Handle `thinking_level_select` by re-evaluating drift, ignoring the
 * session's own writes.
 */
export function handleThinkingLevelSelectDrift(
  ctx: DriftHandlerContext,
  pi: DriftHandlerPi,
  session: ActivePresetSession,
): void {
  if (session.isSelfTriggered()) return;

  syncDirtyFromCurrentState(ctx, pi, session);
}

/** Set the dirty flag from the session's current drift reasons. */
export function syncDirtyFromCurrentState(
  ctx: DriftHandlerContext,
  pi: DriftHandlerPi,
  session: ActivePresetSession,
): void {
  const assessment = session.assess(ctx, pi);

  if (!assessment) return;

  if (assessment.driftReasons.length === 0) {
    session.markClean(ctx);
  } else {
    session.markDirty(ctx);
  }
}
