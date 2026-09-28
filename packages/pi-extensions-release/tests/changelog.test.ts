import {
  getDependencyReleaseLine,
  getReleaseLine,
  insertChangelogSection,
  parseChangesetSummary,
  releaseLinkReference,
  renderChangelogSection,
  type ChangelogRelease,
  type ChangesetSummary,
} from "../src/changelog.ts";
import { describe, expect, it } from "vitest";

const CONFIG_CHANGESET: ChangesetSummary = {
  id: "theme-sync-config",
  summary: [
    "- Fixed: Fall back to the other scope when a setting is invalid",
    "- Changed: **Breaking:** Read the configuration from `config.json`",
    "  and migrate `settings.json` at session start",
    "- Added: Add F1 help to the configuration form",
  ].join("\n"),
};

const TEXT_CHANGESET: ChangesetSummary = {
  id: "theme-sync-text",
  summary: [
    "- Changed: Label scopes User and Project",
    "",
    "- Removed: Remove the Global scope label",
  ].join("\n"),
};

const RELEASE: ChangelogRelease = {
  date: "2026-10-01",
  dependencyUpdates: [],
  name: "@sherif-fanous/pi-theme-sync",
  summaries: [CONFIG_CHANGESET, TEXT_CHANGESET],
  version: "0.6.0",
};

const TAG_URL =
  "https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-theme-sync%400.6.0";

describe("parseChangesetSummary", () => {
  it("reads each bullet's group and joins its continuation lines", () => {
    expect(parseChangesetSummary(CONFIG_CHANGESET)).toEqual([
      {
        group: "Fixed",
        text: "Fall back to the other scope when a setting is invalid",
      },
      {
        group: "Changed",
        text: "**Breaking:** Read the configuration from `config.json` and migrate `settings.json` at session start",
      },
      { group: "Added", text: "Add F1 help to the configuration form" },
    ]);
  });

  it("rejects a bullet without a group prefix", () => {
    expect(() =>
      parseChangesetSummary({ id: "bare", summary: "- Fix the footer" }),
    ).toThrow(
      'Changeset "bare": start every entry with "Changed:", "Added:", "Removed:", or "Fixed:", not "Fix the footer".',
    );
  });

  it("rejects an unknown group", () => {
    expect(() =>
      parseChangesetSummary({ id: "odd", summary: "- Security: Fix a leak" }),
    ).toThrow(/start every entry with/u);
  });

  it("rejects text that is not a bullet", () => {
    expect(() =>
      parseChangesetSummary({
        id: "prose",
        summary: "Fixed: the footer\n\n- Fixed: The header",
      }),
    ).toThrow('Changeset "prose": write every entry as a "- " bullet');
  });

  it("rejects an empty summary", () => {
    expect(() => parseChangesetSummary({ id: "empty", summary: "" })).toThrow(
      'Changeset "empty" has no entries.',
    );
  });
});

describe("renderChangelogSection", () => {
  it("groups entries in Common Changelog order with breaking entries first", () => {
    expect(renderChangelogSection(RELEASE)).toBe(
      [
        "## [0.6.0] - 2026-10-01",
        "",
        "### Changed",
        "",
        "- **Breaking:** Read the configuration from `config.json` and migrate `settings.json` at session start",
        "- Label scopes User and Project",
        "",
        "### Added",
        "",
        "- Add F1 help to the configuration form",
        "",
        "### Removed",
        "",
        "- Remove the Global scope label",
        "",
        "### Fixed",
        "",
        "- Fall back to the other scope when a setting is invalid",
        "",
      ].join("\n"),
    );
  });

  it("lists dependency updates last under Changed", () => {
    const section = renderChangelogSection({
      ...RELEASE,
      dependencyUpdates: [
        { name: "@sherif-fanous/pi-extensions-core", version: "0.1.0" },
      ],
      summaries: [{ id: "fix", summary: "- Fixed: Fix the footer" }],
    });

    expect(section).toBe(
      [
        "## [0.6.0] - 2026-10-01",
        "",
        "### Changed",
        "",
        "- Update `@sherif-fanous/pi-extensions-core` to 0.1.0",
        "",
        "### Fixed",
        "",
        "- Fix the footer",
        "",
      ].join("\n"),
    );
  });
});

describe("releaseLinkReference", () => {
  it("links the monorepo tag of the release", () => {
    expect(releaseLinkReference(RELEASE)).toBe(`[0.6.0]: ${TAG_URL}`);
  });
});

describe("insertChangelogSection", () => {
  const release: ChangelogRelease = {
    ...RELEASE,
    summaries: [{ id: "fix", summary: "- Fixed: Fix the footer" }],
  };
  const section = [
    "## [0.6.0] - 2026-10-01",
    "",
    "### Fixed",
    "",
    "- Fix the footer",
  ];

  it("adds the section above the newest one and its link above the others", () => {
    const changelog = [
      "# Changelog",
      "",
      "This changelog follows [Common Changelog](https://common-changelog.org/).",
      "",
      "## [0.5.0] - 2026-09-08",
      "",
      "### Fixed",
      "",
      "- Fix the header",
      "",
      "[0.5.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.5.0",
      "",
    ].join("\n");

    expect(insertChangelogSection(changelog, release)).toBe(
      [
        "# Changelog",
        "",
        "This changelog follows [Common Changelog](https://common-changelog.org/).",
        "",
        ...section,
        "",
        "## [0.5.0] - 2026-09-08",
        "",
        "### Fixed",
        "",
        "- Fix the header",
        "",
        `[0.6.0]: ${TAG_URL}`,
        "[0.5.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.5.0",
        "",
      ].join("\n"),
    );
  });

  it("adds the first section and link after the header", () => {
    expect(insertChangelogSection("# Changelog\n", release)).toBe(
      ["# Changelog", "", ...section, "", `[0.6.0]: ${TAG_URL}`, ""].join("\n"),
    );
  });

  it("refuses a version the changelog already has", () => {
    const changelog = insertChangelogSection("# Changelog\n", release);

    expect(() => insertChangelogSection(changelog, release)).toThrow(
      "@sherif-fanous/pi-theme-sync's changelog already has a section for 0.6.0.",
    );
  });
});

describe("Changesets changelog hooks", () => {
  it("stop a bare changeset version", () => {
    expect(() => getReleaseLine()).toThrow("Run `mise run version`");
    expect(() => getDependencyReleaseLine()).toThrow("Run `mise run version`");
  });
});
