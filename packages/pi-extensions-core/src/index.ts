/**
 * Shared runtime helpers for Pi extensions.
 *
 * Every export is stateless: each installed extension may load its own copy
 * of this package, so nothing here may rely on module-level state.
 */

export { describeError } from "./errors.js";
export { isNotFoundError, isRecord } from "./guards.js";
