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
export { describeError } from "./errors.js";
export {
  guardCommand,
  type GuardContext,
  guardEvent,
  notifyWarnings,
  subcommandCompletions,
  type SubcommandCompletion,
} from "./extension.js";
export { isNotFoundError, isRecord } from "./guards.js";
export { isInteractiveTui } from "./interactive.js";
export { parseJsonObject, type ParseJsonObjectResult } from "./json.js";
export { extensionConfigPath, projectConfigPath } from "./paths.js";
export {
  alignLabelRows,
  type CommandReport,
  type CommandReportChannel,
  createCommandReport,
  styleReport,
} from "./report.js";
