/**
 * Shared runtime helpers for Pi extensions.
 *
 * Every export is stateless: each installed extension may load its own copy
 * of this package, so nothing here may rely on module-level state.
 */

export {
  atomicWrite,
  type AtomicWriteFs,
  writeJsonFile,
} from "./atomic-write.js";
export {
  malformedConfigWarning,
  unreadableConfigWarning,
} from "./config-warnings.js";
export { describeError, describeErrorSentence } from "./errors.js";
export {
  guardCommand,
  type GuardContext,
  guardEvent,
  notifyUsageWarning,
  notifyWarnings,
  subcommandCompletions,
  type SubcommandCompletion,
} from "./extension.js";
export {
  frameBodyRows,
  frameBodyWidth,
  frameLine,
  type FrameOptions,
  frameSegment,
  type FrameTheme,
  frameTop,
  padToWidth,
  renderFrame,
} from "./frame.js";
export { isNotFoundError, isRecord } from "./guards.js";
export { isInteractiveTui, requireInteractiveTui } from "./interactive.js";
export { parseJsonObject, type ParseJsonObjectResult } from "./json.js";
export {
  formatKeyId,
  keyHint,
  keyText,
  matchesHelpKey,
  matchSelectAction,
  type SelectAction,
  wrapKeyHints,
} from "./key-hints.js";
export {
  emptyStateLines,
  type ListMove,
  listPosition,
  listWindow,
  type ListWindow,
  moveListSelection,
  type ScrolledLines,
  scrollLines,
} from "./list.js";
export {
  overlayMaxHeight,
  overlayOptions,
  type OverlaySize,
} from "./overlay.js";
export { extensionConfigPath, projectConfigPath } from "./paths.js";
export {
  alignLabelRows,
  type CommandReport,
  type CommandReportChannel,
  createCommandReport,
  styleReport,
} from "./report.js";
export { pluralize } from "./text.js";
