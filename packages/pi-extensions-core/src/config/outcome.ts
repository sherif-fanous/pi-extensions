/**
 * What reading an extension's configuration found, with what a session
 * start migrated, and how it reaches the user: one info line, one warning
 * notification, and the status report's `Config:` block.
 */

import { notifyWarnings, type GuardContext } from "../commands/extension.js";
import { alignLabelRows } from "../commands/report.js";
import {
  configFileWarnings,
  configScopeLabel,
  type ConfigFile,
  type ConfigScope,
} from "./file.js";

/** Files one migration step rewrote, and warnings for those it could not. */
export interface ConfigMigration {
  /** Paths of the `config.json` files written, in the order written. */
  readonly migrated: readonly string[];
  /** One warning per file the step could not migrate. */
  readonly warnings: readonly string[];
}

/**
 * Each scope's file as one read found it, with the migrations and invalid
 * values the extension added. Immutable: the `with…` methods return a new
 * outcome.
 */
export interface ConfigOutcome<S extends ConfigScope> {
  /** Each scope's file as the read found it. */
  readonly files: Readonly<Record<S, ConfigFile>>;
  /** Paths of every `config.json` the added migrations wrote, in order. */
  readonly migrated: readonly string[];
  /** The added migrations' warnings, in order. */
  readonly migrationWarnings: readonly string[];
  /**
   * Show what a session start found: one info message naming every
   * migrated file (`<Display Name> migrated its configuration to <path>.`)
   * when there is one, then one warning notification listing migration
   * warnings, file warnings, value warnings, and `extras`, in that order.
   * Shows nothing when both are empty.
   */
  readonly notify: (ctx: GuardContext, extras?: readonly string[]) => void;
  /**
   * The status report's `Config:` block: User before Project, each
   * scope's state on its label row and its path on the next line.
   */
  readonly statusLines: readonly string[];
  /**
   * The warnings a status report lists under `Warnings:`: migration
   * warnings, then value warnings. File problems show in `statusLines`
   * instead.
   */
  readonly statusWarnings: readonly string[];
  /** Warnings about invalid values, as the extension added them. */
  readonly valueWarnings: readonly string[];
  /**
   * Every warning, in the order `notify` shows them: migration warnings,
   * file warnings, then value warnings. For a report without a `Config:`
   * block.
   */
  readonly warnings: readonly string[];
  /** A copy with `migrations` added after the ones already present. */
  readonly withMigrations: (
    ...migrations: readonly ConfigMigration[]
  ) => ConfigOutcome<S>;
  /** A copy with `warnings` added after the value warnings already present. */
  readonly withValueWarnings: (warnings: readonly string[]) => ConfigOutcome<S>;
}

/** Scopes in the order file warnings and the `Config:` block list them. */
const SCOPE_ORDER: readonly ConfigScope[] = ["user", "project"];

/** Build the outcome of one read, before migrations or value warnings. */
export function createConfigOutcome<S extends ConfigScope>(
  extensionName: string,
  files: Readonly<Record<S, ConfigFile>>,
  migration: ConfigMigration = { migrated: [], warnings: [] },
  valueWarnings: readonly string[] = [],
): ConfigOutcome<S> {
  const ordered = orderedFiles(files);
  const warnings = [
    ...migration.warnings,
    ...configFileWarnings(ordered),
    ...valueWarnings,
  ];

  return {
    files,
    migrated: migration.migrated,
    migrationWarnings: migration.warnings,
    notify: (ctx, extras = []) => {
      const [first, ...rest] = migration.migrated;

      if (first !== undefined) {
        ctx.ui.notify(
          configMigratedMessage(extensionName, [first, ...rest]),
          "info",
        );
      }

      notifyWarnings(ctx, extensionName, [...warnings, ...extras]);
    },
    statusLines: configStatusLines(ordered),
    statusWarnings: [...migration.warnings, ...valueWarnings],
    valueWarnings,
    warnings,
    withMigrations: (...migrations) =>
      createConfigOutcome(
        extensionName,
        files,
        {
          migrated: [
            ...migration.migrated,
            ...migrations.flatMap((added) => added.migrated),
          ],
          warnings: [
            ...migration.warnings,
            ...migrations.flatMap((added) => added.warnings),
          ],
        },
        valueWarnings,
      ),
    withValueWarnings: (added) =>
      createConfigOutcome(extensionName, files, migration, [
        ...valueWarnings,
        ...added,
      ]),
  };
}

/**
 * The info message for a startup migration:
 * `<extensionName> migrated its configuration to <path>.`, with two paths
 * joined by `and` and more as `a, b, and c`.
 */
function configMigratedMessage(
  extensionName: string,
  paths: readonly [string, ...string[]],
): string {
  const joined =
    paths.length <= 2
      ? paths.join(" and ")
      : `${paths.slice(0, -1).join(", ")}, and ${paths.at(-1) ?? ""}`;

  return `${extensionName} migrated its configuration to ${joined}.`;
}

/**
 * Lines of the `Config:` block for files already in User, Project order,
 * with each path on the line after its state, aligned under the state:
 *
 * ```text
 * Config:
 *   User:    loaded
 *            /Users/me/.pi/agent/theme-sync/config.json
 *   Project: skipped (untrusted)
 *            /repo/.pi/theme-sync/config.json
 * ```
 */
function configStatusLines(files: readonly ConfigFile[]): string[] {
  const labels = files.map((file) => `${configScopeLabel(file.scope)}:`);
  const rows = alignLabelRows(
    files.map((file, index) => [labels[index] ?? "", stateText(file)]),
  );
  // alignLabelRows indents by two and puts one space after the label.
  const pathIndent = " ".repeat(
    2 + Math.max(0, ...labels.map((label) => label.length)) + 1,
  );

  return [
    "Config:",
    ...files.flatMap((file, index) => [
      rows[index] ?? "",
      `${pathIndent}${file.path}`,
    ]),
  ];
}

/** The files present in `files`, User before Project. */
function orderedFiles<S extends ConfigScope>(
  files: Readonly<Record<S, ConfigFile>>,
): ConfigFile[] {
  const byScope: Partial<Record<ConfigScope, ConfigFile>> = files;

  return SCOPE_ORDER.flatMap((scope) => {
    const file = byScope[scope];

    return file === undefined ? [] : [file];
  });
}

/**
 * A file's state as the `Config:` block words it: `loaded`, `not found`,
 * `invalid: <reason>`, or `skipped (untrusted)`.
 */
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
