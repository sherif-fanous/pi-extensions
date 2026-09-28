/**
 * Shared runtime helpers for Pi extensions.
 *
 * Every export is stateless: each installed extension may load its own copy
 * of this package, so nothing here may rely on module-level state.
 */

export {
  type ConfigContext,
  type ConfigFile,
  type ConfigScope,
  configScopeLabel,
} from "./config/file.js";
export {
  type ConfigFileDescription,
  type ConfigFileHandle,
  defineConfigFile,
} from "./config/handle.js";
export type { ConfigKeyRename } from "./config/keys.js";
export type { ConfigMigration, ConfigOutcome } from "./config/outcome.js";
export { describeError, describeErrorSentence } from "./errors.js";
export {
  guardCommand,
  type GuardContext,
  guardEvent,
  notifyUsageWarning,
  notifyWarnings,
  subcommandCompletions,
  type SubcommandCompletion,
} from "./commands/extension.js";
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
} from "./tui/frame.js";
export { isNotFoundError, isRecord } from "./guards.js";
export {
  isInteractiveTui,
  requireInteractiveTui,
} from "./commands/interactive.js";
export {
  formatKeyId,
  keyHint,
  keyText,
  matchesHelpKey,
  matchSelectAction,
  type SelectAction,
  wrapKeyHints,
} from "./tui/key-hints.js";
export {
  emptyStateLines,
  type ListMove,
  listPosition,
  listWindow,
  type ListWindow,
  moveListSelection,
  type ScrolledLines,
  scrollLines,
} from "./tui/list.js";
export {
  overlayMaxHeight,
  overlayOptions,
  type OverlaySize,
} from "./tui/overlay.js";
export {
  alignLabelRows,
  type CommandReport,
  type CommandReportChannel,
  createCommandReport,
  styleReport,
} from "./commands/report.js";
export { pluralize } from "./text.js";
