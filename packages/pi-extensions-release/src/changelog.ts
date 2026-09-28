/**
 * Common Changelog entries built from changesets.
 *
 * Every entry in a changeset's summary is a `- ` bullet that starts with its
 * group, `Added:`, `Changed:`, `Removed:`, or `Fixed:`. The prefix picks the
 * `###` group and is dropped from the entry; any other start is an error.
 *
 * `.changeset/config.json` also names this module as its `changelog`, so
 * `getReleaseLine` and `getDependencyReleaseLine` stop a bare
 * `changeset version`, which would write Changesets' own `## x.y.z` and
 * `### Minor Changes` headings instead.
 */

/** One changelog entry: its group and its text without the group prefix. */
export interface ChangelogEntry {
  readonly group: ChangelogGroup;
  readonly text: string;
}

/** A package release to write a changelog section for. */
export interface ChangelogRelease {
  /** Release date, `YYYY-MM-DD`. */
  readonly date: string;
  /** Workspace packages this one depends on that are released with it. */
  readonly dependencyUpdates: readonly PackageVersion[];
  readonly name: string;
  /** The changesets that release this package. */
  readonly summaries: readonly ChangesetSummary[];
  readonly version: string;
}

/** A changeset's id (its file name) and its markdown summary. */
export interface ChangesetSummary {
  readonly id: string;
  readonly summary: string;
}

/** A package name and a version. */
export interface PackageVersion {
  readonly name: string;
  readonly version: string;
}

/** A changelog group, in the order Common Changelog lists them. */
export type ChangelogGroup = (typeof CHANGELOG_GROUPS)[number];

export const CHANGELOG_GROUPS = [
  "Changed",
  "Added",
  "Removed",
  "Fixed",
] as const;

/** The header every package's CHANGELOG.md starts with. */
export const CHANGELOG_HEADER =
  "# Changelog\n\nThis changelog follows [Common Changelog](https://common-changelog.org/).\n";

/** The repository whose release tags the changelog link references point to. */
export const REPOSITORY_URL = "https://github.com/sherif-fanous/pi-extensions";

const BARE_VERSION_MESSAGE =
  "Run `mise run version` instead of `changeset version`: it writes the changelogs in Common Changelog style.";

const BREAKING_PREFIX = "**Breaking:**";

const ENTRY_PATTERN = new RegExp(
  `^(${CHANGELOG_GROUPS.join("|")}): +(\\S[\\s\\S]*)$`,
  "u",
);

const VERSION_HEADING_PATTERN = /^## \[\d/u;

const VERSION_LINK_REFERENCE_PATTERN = /^\[\d[^\]]*\]:/u;

/**
 * Changesets' `getDependencyReleaseLine` hook. Always throws, so a bare
 * `changeset version` stops before it changes any file.
 */
export function getDependencyReleaseLine(): never {
  throw new Error(BARE_VERSION_MESSAGE);
}

/**
 * Changesets' `getReleaseLine` hook. Always throws, so a bare
 * `changeset version` stops before it changes any file.
 */
export function getReleaseLine(): never {
  throw new Error(BARE_VERSION_MESSAGE);
}

/**
 * Add a release's section above the newest version section, or after the
 * header when there is none, and its link reference above the others.
 * Throws when the changelog already has a section for the version.
 */
export function insertChangelogSection(
  changelog: string,
  release: ChangelogRelease,
): string {
  const lines = changelog.trimEnd().split("\n");

  if (lines.some((line) => line.startsWith(`## [${release.version}]`))) {
    throw new Error(
      `${release.name}'s changelog already has a section for ${release.version}.`,
    );
  }

  const referenceStart = lines.findIndex((line) =>
    VERSION_LINK_REFERENCE_PATTERN.test(line),
  );
  const references = referenceStart === -1 ? [] : lines.splice(referenceStart);
  const headingIndex = lines.findIndex((line) =>
    VERSION_HEADING_PATTERN.test(line),
  );
  const section = renderChangelogSection(release).trimEnd().split("\n");

  if (headingIndex === -1) {
    lines.push("", ...section);
  } else {
    lines.splice(headingIndex, 0, ...section, "");
  }

  const body = lines.join("\n").trimEnd();
  const referenceBlock = [releaseLinkReference(release), ...references];

  return `${body}\n\n${referenceBlock.join("\n")}\n`;
}

/**
 * Split a changeset summary into its entries. Throws when a line is neither
 * the start of a `- <Group>: ` bullet nor a continuation of one.
 */
export function parseChangesetSummary(
  changeset: ChangesetSummary,
): ChangelogEntry[] {
  const bullets: string[][] = [];
  let continues = false;

  for (const line of changeset.summary.split("\n")) {
    if (line.trim() === "") {
      continues = false;
    } else if (line.startsWith("- ")) {
      bullets.push([line.slice(2).trim()]);
      continues = true;
    } else if (continues) {
      bullets.at(-1)?.push(line.trim());
    } else {
      throw new Error(
        `Changeset "${changeset.id}": write every entry as a "- " bullet, not "${line.trim()}".`,
      );
    }
  }

  if (bullets.length === 0) {
    throw new Error(`Changeset "${changeset.id}" has no entries.`);
  }

  return bullets.map((bullet) => {
    const text = bullet.join(" ");
    const match = ENTRY_PATTERN.exec(text);
    const group = CHANGELOG_GROUPS.find((name) => name === match?.[1]);

    if (!group || !match?.[2]) {
      throw new Error(
        `Changeset "${changeset.id}": start every entry with ${formatGroupList()}, not "${text}".`,
      );
    }

    return { group, text: match[2] };
  });
}

/** The link reference for a release's tag, such as `[1.2.0]: <url>`. */
export function releaseLinkReference(release: PackageVersion): string {
  const tag = encodeURIComponent(`${release.name}@${release.version}`);

  return `[${release.version}]: ${REPOSITORY_URL}/releases/tag/${tag}`;
}

/**
 * A release's `## [x.y.z] - YYYY-MM-DD` section, with its entries in groups.
 * Breaking entries come first in their group; dependency updates come last
 * under Changed.
 */
export function renderChangelogSection(release: ChangelogRelease): string {
  const entries = [
    ...release.summaries.flatMap((changeset) =>
      parseChangesetSummary(changeset),
    ),
    ...release.dependencyUpdates.map((dependency): ChangelogEntry => ({
      group: "Changed",
      text: `Update \`${dependency.name}\` to ${dependency.version}`,
    })),
  ];
  const groups = CHANGELOG_GROUPS.flatMap((group) => {
    const texts = entries
      .filter((entry) => entry.group === group)
      .map((entry) => entry.text);
    const ordered = [
      ...texts.filter((text) => text.startsWith(BREAKING_PREFIX)),
      ...texts.filter((text) => !text.startsWith(BREAKING_PREFIX)),
    ];

    return ordered.length === 0
      ? []
      : [`### ${group}`, "", ...ordered.map((text) => `- ${text}`), ""];
  });

  return [`## [${release.version}] - ${release.date}`, "", ...groups].join(
    "\n",
  );
}

function formatGroupList(): string {
  const prefixes = CHANGELOG_GROUPS.map((group) => `"${group}:"`);

  return `${prefixes.slice(0, -1).join(", ")}, or ${prefixes.at(-1) ?? ""}`;
}
