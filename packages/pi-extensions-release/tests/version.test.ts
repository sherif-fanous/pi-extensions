import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { checkChangesets, versionPackages } from "../src/version.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CORE = "@sherif-fanous/pi-extensions-core";
const EXTENSION = "@sherif-fanous/pi-theme-sync";

let root = "";

async function readText(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

async function writeWorkspace(): Promise<void> {
  await writeText(
    "package.json",
    JSON.stringify({ name: "workspace", private: true }),
  );
  await writeText("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
  await writeText(
    ".changeset/config.json",
    JSON.stringify({
      access: "public",
      baseBranch: "main",
      changelog: false,
      ___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH: {
        updateInternalDependents: "always",
      },
    }),
  );

  await writeText(
    "packages/core/package.json",
    JSON.stringify({ name: CORE, version: "0.0.0" }),
  );
  await writeText("packages/core/CHANGELOG.md", "# Changelog\n");
  await writeText(
    "packages/extension/package.json",
    JSON.stringify({
      name: EXTENSION,
      version: "0.5.0",
      dependencies: { [CORE]: "workspace:*" },
    }),
  );

  await writeText(
    "packages/extension/CHANGELOG.md",
    [
      "# Changelog",
      "",
      "## [0.5.0] - 2026-09-08",
      "",
      "### Fixed",
      "",
      "- Fix the header",
      "",
      "[0.5.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.5.0",
      "",
    ].join("\n"),
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-extensions-release-"));
  await writeWorkspace();
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("versionPackages", () => {
  it("bumps versions, writes Common Changelog sections, and deletes the changesets", async () => {
    await writeText(
      ".changeset/core-first-release.md",
      `---\n"${CORE}": minor\n---\n\n- Added: Add \`describeError\`\n`,
    );

    await writeText(
      ".changeset/theme-sync-config.md",
      `---\n"${EXTENSION}": minor\n---\n\n- Changed: **Breaking:** Read \`config.json\`\n- Fixed: Fix the footer\n`,
    );

    const released = await versionPackages(root, "2026-10-01");

    expect(released).toEqual([
      { name: CORE, newVersion: "0.1.0", oldVersion: "0.0.0" },
      { name: EXTENSION, newVersion: "0.6.0", oldVersion: "0.5.0" },
    ]);

    expect(JSON.parse(await readText("packages/core/package.json"))).toEqual({
      name: CORE,
      version: "0.1.0",
    });

    expect(await readText("packages/core/CHANGELOG.md")).toBe(
      [
        "# Changelog",
        "",
        "## [0.1.0] - 2026-10-01",
        "",
        "### Added",
        "",
        "- Add `describeError`",
        "",
        "[0.1.0]: https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-extensions-core%400.1.0",
        "",
      ].join("\n"),
    );

    expect(await readText("packages/extension/CHANGELOG.md")).toBe(
      [
        "# Changelog",
        "",
        "## [0.6.0] - 2026-10-01",
        "",
        "### Changed",
        "",
        "- **Breaking:** Read `config.json`",
        "- Update `@sherif-fanous/pi-extensions-core` to 0.1.0",
        "",
        "### Fixed",
        "",
        "- Fix the footer",
        "",
        "## [0.5.0] - 2026-09-08",
        "",
        "### Fixed",
        "",
        "- Fix the header",
        "",
        "[0.6.0]: https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-theme-sync%400.6.0",
        "[0.5.0]: https://github.com/sherif-fanous/pi-theme-sync/releases/tag/v0.5.0",
        "",
      ].join("\n"),
    );
    expect(await readdir(join(root, ".changeset"))).toEqual(["config.json"]);
  });

  it("gives a dependent a patch release that names the dependency update", async () => {
    await writeText(
      ".changeset/core-fix.md",
      `---\n"${CORE}": patch\n---\n\n- Fixed: Fix \`describeError\`\n`,
    );

    const released = await versionPackages(root, "2026-10-01");

    expect(released).toContainEqual({
      name: EXTENSION,
      newVersion: "0.5.1",
      oldVersion: "0.5.0",
    });

    expect(await readText("packages/extension/CHANGELOG.md")).toContain(
      [
        "## [0.5.1] - 2026-10-01",
        "",
        "### Changed",
        "",
        "- Update `@sherif-fanous/pi-extensions-core` to 0.0.1",
      ].join("\n"),
    );
  });

  it("changes no file when a changeset has an entry without a group", async () => {
    const changeset = `---\n"${EXTENSION}": patch\n---\n\n- Fix the footer\n`;

    await writeText(".changeset/theme-sync-fix.md", changeset);

    await expect(versionPackages(root, "2026-10-01")).rejects.toThrow(
      'Changeset "theme-sync-fix": start every entry with',
    );
    expect(await readText(".changeset/theme-sync-fix.md")).toBe(changeset);
    expect(
      JSON.parse(await readText("packages/extension/package.json")),
    ).toMatchObject({ version: "0.5.0" });
  });

  it("starts a missing changelog with the family header", async () => {
    await rm(join(root, "packages/core/CHANGELOG.md"));
    await writeText(
      ".changeset/core-first-release.md",
      `---\n"${CORE}": minor\n---\n\n- Added: Add \`describeError\`\n`,
    );

    await versionPackages(root, "2026-10-01");

    expect(await readText("packages/core/CHANGELOG.md")).toBe(
      [
        "# Changelog",
        "",
        "This changelog follows [Common Changelog](https://common-changelog.org/).",
        "",
        "## [0.1.0] - 2026-10-01",
        "",
        "### Added",
        "",
        "- Add `describeError`",
        "",
        "[0.1.0]: https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-extensions-core%400.1.0",
        "",
      ].join("\n"),
    );
  });

  it("refuses to run without changesets", async () => {
    await expect(versionPackages(root, "2026-10-01")).rejects.toThrow(
      "No changesets to release.",
    );
  });
});

describe("checkChangesets", () => {
  it("counts valid changesets without changing any file", async () => {
    const changeset = `---\n"${EXTENSION}": patch\n---\n\n- Fixed: Fix the footer\n`;

    await writeText(".changeset/theme-sync-fix.md", changeset);

    await expect(checkChangesets(root)).resolves.toBe(1);
    expect(await readText(".changeset/theme-sync-fix.md")).toBe(changeset);
    expect(
      JSON.parse(await readText("packages/extension/package.json")),
    ).toMatchObject({ version: "0.5.0" });
  });

  it("accepts no changesets", async () => {
    await expect(checkChangesets(root)).resolves.toBe(0);
  });

  it("rejects an entry without a group", async () => {
    await writeText(
      ".changeset/theme-sync-fix.md",
      `---\n"${EXTENSION}": patch\n---\n\n- Fix: Fix the footer\n`,
    );

    await expect(checkChangesets(root)).rejects.toThrow(
      'Changeset "theme-sync-fix": start every entry with',
    );
  });

  it("rejects an unknown package", async () => {
    await writeText(
      ".changeset/typo.md",
      `---\n"@sherif-fanous/pi-theme-snyc": patch\n---\n\n- Fixed: Fix the footer\n`,
    );

    await expect(checkChangesets(root)).rejects.toThrow(
      'Changeset "typo": no workspace package is named @sherif-fanous/pi-theme-snyc.',
    );
  });

  it("rejects a major bump below 1.0.0", async () => {
    await writeText(
      ".changeset/theme-sync-break.md",
      `---\n"${EXTENSION}": major\n---\n\n- Changed: **Breaking:** Rename a key\n`,
    );

    await expect(checkChangesets(root)).rejects.toThrow(
      "is below 1.0.0, so a breaking change is a minor bump, not major.",
    );
  });
});
