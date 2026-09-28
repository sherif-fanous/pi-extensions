/**
 * Covers validating consolidated settings and preset scopes, including
 * fail-open warnings and the legacy project file an untrusted project
 * reports.
 */
import { join } from "node:path";

import { loadPresetsConfig } from "../../src/store/api.js";
import { parseScope, PRESETS_PLUS_CONFIG } from "../../src/store/config.js";
import type { PresetScope } from "../../src/types.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dirs: TempConfigDirs;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
});

afterEach(async () => {
  await dirs.cleanup();
});

function context(trusted = true) {
  return {
    ...createProjectTrustContext(dirs.cwd, trusted),
    modelRegistry: makeStubModelRegistry({ models: {} }),
  };
}

async function load(scope: PresetScope, trusted = true) {
  return parseScope(
    scope,
    await PRESETS_PLUS_CONFIG.read(context(trusted), scope),
  );
}

function projectPath(): string {
  return join(dirs.cwd, ".pi", "presets-plus", "config.json");
}

function userPath(): string {
  return join(dirs.agentDir, "presets-plus", "config.json");
}

describe("parseScope", () => {
  it("loads explicit settings and warns when project settings are invalid", async () => {
    await dirs.writeJson(userPath(), { version: 2, showInactiveStatus: false });
    await dirs.writeJson(projectPath(), {
      version: 2,
      showInactiveStatus: true,
    });

    await expect(load("project")).resolves.toMatchObject({
      showInactiveStatus: true,
      warnings: { file: [], presets: [], policy: [] },
    });

    await dirs.writeJson(projectPath(), {
      version: 2,
      showInactiveStatus: "yes",
    });

    await expect(load("project")).resolves.toMatchObject({
      invalidShowInactiveStatus: { value: "yes" },
    });
  });

  it("defaults to showing inactive status when files are missing", async () => {
    const result = await loadPresetsConfig(context());

    expect(result.showInactiveStatus).toBe(true);
    expect(result.config.warnings).toEqual([]);
    expect(
      [result.config.files.user, result.config.files.project].map(
        (file) => file.state,
      ),
    ).toEqual(["missing", "missing"]);
  });

  it("resolves project, user, then default status", async () => {
    await dirs.writeJson(userPath(), { version: 2, showInactiveStatus: false });
    expect((await loadPresetsConfig(context())).showInactiveStatus).toBe(false);

    await dirs.writeJson(projectPath(), {
      version: 2,
      showInactiveStatus: true,
    });
    expect((await loadPresetsConfig(context())).showInactiveStatus).toBe(true);
  });

  it("fails open with an invalid file and keeps its warning", async () => {
    const path = userPath();

    await dirs.writeText(path, "{");

    const result = await load("user");

    expect(result.file.state).toBe("invalid");
    expect(result.showInactiveStatus).toBeUndefined();
    expect(result.warnings.file).toEqual([
      expect.stringMatching(/^Configuration at .+ is not valid JSON: /u),
    ]);
    expect(await dirs.exists(path)).toBe(true);
  });

  it("fails open and records an invalid field type", async () => {
    await dirs.writeJson(userPath(), { showInactiveStatus: "no", version: 2 });

    const result = await load("user");

    expect(result.showInactiveStatus).toBeUndefined();
    expect(result.invalidShowInactiveStatus).toEqual({ value: "no" });
    expect(result.warnings.file).toEqual([]);
  });
});

describe("an untrusted project", () => {
  it("skips a legacy project presets file the migration left alone", async () => {
    const legacyPath = join(dirs.cwd, ".pi", "presets-plus", "presets.json");

    await dirs.writeJson(legacyPath, { version: 1, presets: [] });

    const result = await load("project", false);

    expect(result.file).toMatchObject({ path: legacyPath, state: "untrusted" });
    expect(result.warnings.file).toEqual([
      `Skipped project configuration at ${legacyPath} because the project is not trusted. Trust the project to use it.`,
    ]);
  });
});
