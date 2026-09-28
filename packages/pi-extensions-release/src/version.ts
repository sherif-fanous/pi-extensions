/**
 * `mise run version`: `changeset version` with Common Changelog entries.
 *
 * Reads the pending changesets and the release plan the way `changeset
 * version` does, renders every changelog section first (so an invalid
 * changeset stops the run before any file changes), applies the plan without
 * Changesets' changelog writer (bumping versions and deleting the
 * changesets), then adds each section to the package's CHANGELOG.md and
 * formats it with Prettier.
 *
 * Node runs this file directly, which is why its imports end in `.ts`.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CHANGELOG_HEADER,
  insertChangelogSection,
  type ChangelogRelease,
  type PackageVersion,
} from "./changelog.ts";
import { applyReleasePlan } from "@changesets/apply-release-plan";
import { assembleReleasePlan } from "@changesets/assemble-release-plan";
import { readConfig } from "@changesets/config";
import { readChangesets } from "@changesets/read";
import type { PackageJSON } from "@changesets/types";
import { getPackages } from "@manypkg/get-packages";
import { format, resolveConfig } from "prettier";

/** A package `versionPackages` released, with its old and new versions. */
export interface VersionedPackage {
  readonly name: string;
  readonly newVersion: string;
  readonly oldVersion: string;
}

/** A planned release, rendered but not yet written. */
interface PreparedRelease {
  readonly apply: () => Promise<VersionedPackage[]>;
  readonly pending: number;
}

/**
 * Check every pending changeset under `cwd`, the workspace root, the way
 * `mise run version` would read it, without changing any file. Returns how
 * many changesets are pending; throws on the first invalid one.
 */
export async function checkChangesets(cwd: string): Promise<number> {
  return (await prepareRelease(cwd, "2000-01-01")).pending;
}

/**
 * Version every package with pending changesets under `cwd`, the workspace
 * root, and add a changelog section dated `date` (`YYYY-MM-DD`) to each.
 */
export async function versionPackages(
  cwd: string,
  date: string,
): Promise<VersionedPackage[]> {
  const prepared = await prepareRelease(cwd, date);

  if (prepared.pending === 0) {
    throw new Error(
      "No changesets to release. Add one with `mise run changeset`.",
    );
  }

  return prepared.apply();
}

/** The workspace packages `packageJson` depends on that `released` bumps. */
function dependencyUpdates(
  packageJson: PackageJSON,
  released: readonly VersionedPackage[],
): PackageVersion[] {
  const dependencies = {
    ...packageJson.peerDependencies,
    ...packageJson.dependencies,
  };

  return released
    .filter((release) => release.name in dependencies)
    .map((release) => ({ name: release.name, version: release.newVersion }));
}

/** Today's date in local time, `YYYY-MM-DD`. */
function localDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Read the config, changesets and release plan, and render every changelog
 * section, so an invalid changeset throws before any file changes.
 */
async function prepareRelease(
  cwd: string,
  date: string,
): Promise<PreparedRelease> {
  const packages = await getPackages(cwd);
  const { config, errors } = await readConfig(cwd, packages);

  if (errors) {
    throw new Error(`Invalid .changeset/config.json: ${errors.join(" ")}`);
  }

  const changesets = await readChangesets(cwd);

  for (const changeset of changesets) {
    for (const release of changeset.releases) {
      const workspacePackage = packages.packages.find(
        (candidate) => candidate.packageJson.name === release.name,
      );

      if (!workspacePackage) {
        throw new Error(
          `Changeset "${changeset.id}": no workspace package is named ${release.name}.`,
        );
      }

      if (
        release.type === "major" &&
        workspacePackage.packageJson.version.startsWith("0.")
      ) {
        throw new Error(
          `Changeset "${changeset.id}": ${release.name} is below 1.0.0, so a breaking change is a minor bump, not major.`,
        );
      }
    }
  }

  const plan = assembleReleasePlan(changesets, packages, config, undefined);
  const released = plan.releases.flatMap((release) =>
    release.newVersion && release.oldVersion && release.type !== "none"
      ? [
          {
            name: release.name,
            newVersion: release.newVersion,
            oldVersion: release.oldVersion,
          },
        ]
      : [],
  );
  const sections = released.map((release) => {
    const workspacePackage = packages.packages.find(
      (candidate) => candidate.packageJson.name === release.name,
    );

    if (!workspacePackage) {
      throw new Error(`No workspace package is named ${release.name}.`);
    }

    const changelogRelease: ChangelogRelease = {
      date,
      dependencyUpdates: dependencyUpdates(
        workspacePackage.packageJson,
        released,
      ),
      name: release.name,
      summaries: plan.changesets.filter((changeset) =>
        changeset.releases.some(
          (entry) => entry.name === release.name && entry.type !== "none",
        ),
      ),
      version: release.newVersion,
    };

    return {
      path: join(workspacePackage.dir, "CHANGELOG.md"),
      release: changelogRelease,
    };
  });

  // Render every section before any file changes.
  const texts = await Promise.all(
    sections.map(async ({ path, release }) => ({
      path,
      text: insertChangelogSection(await readChangelog(path), release),
    })),
  );

  return {
    apply: async () => {
      await applyReleasePlan(plan, packages, { ...config, changelog: false });

      for (const { path, text } of texts) {
        const options = await resolveConfig(path);

        await writeFile(
          path,
          await format(text, { ...options, filepath: path }),
        );
      }

      return released;
    },
    pending: changesets.length,
  };
}

async function readChangelog(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return CHANGELOG_HEADER;
    }

    throw error;
  }
}

if (import.meta.main) {
  const released = await versionPackages(process.cwd(), localDate(new Date()));

  for (const release of released) {
    process.stdout.write(
      `${release.name}: ${release.oldVersion} → ${release.newVersion}\n`,
    );
  }

  process.stdout.write(
    "Review the versions and changelogs, then commit them.\n",
  );
}
