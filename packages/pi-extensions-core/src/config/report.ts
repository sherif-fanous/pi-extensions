/**
 * The `Config:` block of a status report, listing each scope's file and
 * what reading it found.
 */

import { alignLabelRows } from "../commands/report.js";
import { configScopeLabel, type ConfigFile, type ConfigScope } from "./file.js";

/** Scopes in the order the block lists them. */
const SCOPE_ORDER: readonly ConfigScope[] = ["user", "project"];

/**
 * Lines of the `Config:` block: the heading, then for each file, User
 * before Project, a `<Scope>:` row with its state and the path on the next
 * line, aligned under the state:
 *
 * ```text
 * Config:
 *   User:    loaded
 *            /Users/me/.pi/agent/theme-sync/config.json
 *   Project: skipped (untrusted)
 *            /repo/.pi/theme-sync/config.json
 * ```
 *
 * States read `loaded`, `not found`, `invalid: <reason>`, and
 * `skipped (untrusted)`.
 */
export function configStatusLines(files: readonly ConfigFile[]): string[] {
  const ordered = [...files].sort(
    (left, right) =>
      SCOPE_ORDER.indexOf(left.scope) - SCOPE_ORDER.indexOf(right.scope),
  );
  const labels = ordered.map((file) => `${configScopeLabel(file.scope)}:`);
  const rows = alignLabelRows(
    ordered.map((file, index) => [labels[index] ?? "", stateText(file)]),
  );
  // alignLabelRows indents by two and puts one space after the label.
  const pathIndent = " ".repeat(
    2 + Math.max(0, ...labels.map((label) => label.length)) + 1,
  );

  return [
    "Config:",
    ...ordered.flatMap((file, index) => [
      rows[index] ?? "",
      `${pathIndent}${file.path}`,
    ]),
  ];
}

function stateText(file: ConfigFile): string {
  switch (file.state) {
    case "invalid":
      return `invalid: ${file.reason}`;
    case "loaded":
      return "loaded";
    case "missing":
      return "not found";
    case "untrusted":
      return "skipped (untrusted)";
  }
}
