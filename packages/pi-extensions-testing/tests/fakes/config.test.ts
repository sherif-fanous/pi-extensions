import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "../../src/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("createProjectTrustContext", () => {
  it("reports the trust it was given for its directory", () => {
    const trusted = createProjectTrustContext("/repo", true);
    const untrusted = createProjectTrustContext("/repo", false);

    expect(trusted.cwd).toBe("/repo");
    expect(trusted.isProjectTrusted()).toBe(true);
    expect(untrusted.isProjectTrusted()).toBe(false);
  });
});

describe("createTempConfigDirs", () => {
  let dirs: TempConfigDirs;

  beforeEach(async () => {
    dirs = await createTempConfigDirs();
  });

  afterEach(async () => {
    await dirs.cleanup();
  });

  it("puts the agent and project directories under its root", () => {
    expect(dirs.agentDir).toBe(join(dirs.root, "agent"));
    expect(dirs.cwd).toBe(join(dirs.root, "project"));
  });

  it("writes JSON and text files into missing directories", async () => {
    const jsonPath = join(dirs.agentDir, "ext", "config.json");
    const textPath = join(dirs.cwd, ".pi", "ext", "config.json");

    await dirs.writeJson(jsonPath, { version: 1 });
    await dirs.writeText(textPath, "{ nope");

    expect(await readFile(jsonPath, "utf8")).toBe('{\n  "version": 1\n}\n');
    expect(await dirs.readJson(jsonPath)).toEqual({ version: 1 });
    expect(await readFile(textPath, "utf8")).toBe("{ nope");
  });

  it("tells existing paths from missing ones", async () => {
    const path = join(dirs.agentDir, "config.json");

    expect(await dirs.exists(path)).toBe(false);

    await dirs.writeJson(path, {});

    expect(await dirs.exists(path)).toBe(true);
  });

  it("removes everything on cleanup", async () => {
    await dirs.writeJson(join(dirs.cwd, "a.json"), {});
    await dirs.cleanup();

    expect(await dirs.exists(dirs.root)).toBe(false);
  });
});
