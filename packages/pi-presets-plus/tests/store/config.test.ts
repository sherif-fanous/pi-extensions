/**
 * Covers loading consolidated settings and preset scopes, including
 * fail-open warnings, the optional `version`, and project trust.
 */
import { loadAll } from "../../src/store/api.js";
import { loadScope } from "../../src/store/config.js";
import { getConfigPath, getProjectPresetsPath } from "../../src/store/paths.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dirs: TempConfigDirs;
let previousAgentDir: string | undefined;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dirs.agentDir;
});

afterEach(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await dirs.cleanup();
});

function context(trusted = true) {
  return {
    ...createProjectTrustContext(dirs.cwd, trusted),
    modelRegistry: makeStubModelRegistry({ models: {} }),
  };
}

function location(trusted = true) {
  return { agentDir: dirs.agentDir, cwd: dirs.cwd, trusted };
}

function projectPath(): string {
  return getConfigPath("project", dirs.cwd, dirs.agentDir);
}

function userPath(): string {
  return getConfigPath("user", dirs.cwd, dirs.agentDir);
}

describe("loadScope", () => {
  it("loads explicit settings and warns when project settings are invalid", async () => {
    await dirs.writeJson(userPath(), { version: 2, showInactiveStatus: false });
    await dirs.writeJson(projectPath(), {
      version: 2,
      showInactiveStatus: true,
    });

    await expect(loadScope("project", location())).resolves.toMatchObject({
      showInactiveStatus: true,
      warnings: { file: [], presets: [], policy: [] },
    });

    await dirs.writeJson(projectPath(), {
      version: 2,
      showInactiveStatus: "yes",
    });

    await expect(loadScope("project", location())).resolves.toMatchObject({
      invalidShowInactiveStatus: { value: "yes" },
    });
  });

  it("reads a file without version as version 2, silently", async () => {
    await dirs.writeJson(userPath(), {
      presets: [{ model: "m", name: "plan", provider: "p" }],
      showInactiveStatus: false,
    });

    const result = await loadScope("user", location());

    expect(result.file.state).toBe("loaded");
    expect(result.showInactiveStatus).toBe(false);
    expect(result.presets.map((preset) => preset.name)).toEqual(["plan"]);
    expect(result.warnings).toEqual({ file: [], presets: [], policy: [] });
  });

  it("defaults to showing inactive status when files are missing", async () => {
    const result = await loadAll(context());

    expect(result.showInactiveStatus).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.files.map((file) => file.state)).toEqual([
      "missing",
      "missing",
    ]);
  });

  it("resolves project, user, then default status", async () => {
    await dirs.writeJson(userPath(), { version: 2, showInactiveStatus: false });
    expect((await loadAll(context())).showInactiveStatus).toBe(false);

    await dirs.writeJson(projectPath(), {
      version: 2,
      showInactiveStatus: true,
    });
    expect((await loadAll(context())).showInactiveStatus).toBe(true);
  });

  it.each([
    [
      "invalid JSON",
      "{",
      (): unknown =>
        expect.stringMatching(
          /^Configuration at .+ is not valid JSON: .+[^.]\. Ignored the file\.$/u,
        ),
    ],
    [
      "unsupported version",
      JSON.stringify({ version: 3 }),
      (path: string) =>
        `Configuration at ${path} has version 3, but only version 2 is supported. Ignored the file.`,
    ],
    [
      "invalid top-level",
      JSON.stringify([]),
      (path: string) =>
        `Configuration at ${path} must be a JSON object. Ignored the file.`,
    ],
  ])("fails open and warns for %s", async (_label, contents, warning) => {
    const path = userPath();

    await dirs.writeText(path, contents);

    const result = await loadScope("user", location());

    expect(result.file.state).toBe("invalid");
    expect(result.showInactiveStatus).toBeUndefined();
    expect(result.warnings.file).toEqual([warning(path)]);
    expect(await dirs.exists(path)).toBe(true);
  });

  it("fails open and records an invalid field type", async () => {
    await dirs.writeJson(userPath(), { showInactiveStatus: "no", version: 2 });

    const result = await loadScope("user", location());

    expect(result.showInactiveStatus).toBeUndefined();
    expect(result.invalidShowInactiveStatus).toEqual({ value: "no" });
    expect(result.warnings.file).toEqual([]);
  });
});

describe("loadScope in an untrusted project", () => {
  it("skips the project file and warns instead of reading it", async () => {
    await dirs.writeJson(projectPath(), {
      presets: [{ model: "m", name: "project", provider: "p" }],
      showInactiveStatus: false,
      version: 2,
    });

    const result = await loadScope("project", location(false));

    expect(result.file).toMatchObject({
      path: projectPath(),
      state: "untrusted",
    });
    expect(result.presets).toEqual([]);
    expect(result.showInactiveStatus).toBeUndefined();
    expect(result.warnings.file).toEqual([
      `Skipped project configuration at ${projectPath()} because the project is not trusted. Trust the project to use it.`,
    ]);
  });

  it("skips a legacy project presets file the migration left alone", async () => {
    const legacyPath = getProjectPresetsPath(dirs.cwd);

    await dirs.writeJson(legacyPath, { version: 1, presets: [] });

    const result = await loadScope("project", location(false));

    expect(result.file).toMatchObject({ path: legacyPath, state: "untrusted" });
    expect(result.warnings.file).toEqual([
      `Skipped project configuration at ${legacyPath} because the project is not trusted. Trust the project to use it.`,
    ]);
  });

  it("stays silent without a project file", async () => {
    const result = await loadScope("project", location(false));

    expect(result.file.state).toBe("missing");
    expect(result.warnings.file).toEqual([]);
  });

  it("still reads the user file", async () => {
    await dirs.writeJson(userPath(), { version: 2, showInactiveStatus: false });
    await dirs.writeJson(projectPath(), {
      version: 2,
      showInactiveStatus: true,
    });

    const result = await loadAll(context(false));

    expect(result.showInactiveStatus).toBe(false);
    expect(result.files.map((file) => file.state)).toEqual([
      "loaded",
      "untrusted",
    ]);
    expect(result.valueWarnings).toEqual([]);
    expect(result.warnings).toEqual([
      `Skipped project configuration at ${projectPath()} because the project is not trusted. Trust the project to use it.`,
    ]);
  });
});
