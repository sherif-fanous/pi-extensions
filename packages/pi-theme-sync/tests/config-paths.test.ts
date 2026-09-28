import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { oldConfigPaths } from "../src/config/migrate.js";
import { configPath } from "../src/config/save.js";
import { afterEach, expect, test, vi } from "vitest";

const project = { cwd: path.join(tmpdir(), "theme-sync-project") };

afterEach(() => {
  vi.unstubAllEnvs();
});

test("uses Pi's default agent directory when there is no override", () => {
  vi.stubEnv("PI_CODING_AGENT_DIR", undefined);

  expect(configPath("user", project)).toBe(
    path.join(homedir(), ".pi", "agent", "theme-sync", "config.json"),
  );
});

test("honors Pi's agent directory override without changing the project path", () => {
  const agentDirectory = path.join(tmpdir(), "theme-sync-custom-agent");

  vi.stubEnv("PI_CODING_AGENT_DIR", agentDirectory);

  expect(configPath("user", project)).toBe(
    path.join(agentDirectory, "theme-sync", "config.json"),
  );

  expect(configPath("project", project)).toBe(
    path.join(project.cwd, ".pi", "theme-sync", "config.json"),
  );

  expect(oldConfigPaths("user", project)).toEqual([
    path.join(agentDirectory, "theme-sync", "settings.json"),
    path.join(agentDirectory, "theme-sync.json"),
  ]);

  expect(oldConfigPaths("project", project)).toEqual([
    path.join(project.cwd, ".pi", "theme-sync", "settings.json"),
    path.join(project.cwd, ".pi", "theme-sync.json"),
  ]);
});

test("uses Pi's tilde expansion for the agent directory", () => {
  vi.stubEnv("PI_CODING_AGENT_DIR", "~/theme-sync-custom-agent");

  expect(configPath("user", project)).toBe(
    path.join(
      homedir(),
      "theme-sync-custom-agent",
      "theme-sync",
      "config.json",
    ),
  );
});
