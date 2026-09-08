import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("uses Pi's default global directory when there is no override", async () => {
  vi.stubEnv("PI_CODING_AGENT_DIR", undefined);
  vi.resetModules();

  const { CONFIG_PATHS } = await import("../src/config.js");

  expect(CONFIG_PATHS.global).toBe(
    path.join(homedir(), ".pi", "agent", "theme-sync.json"),
  );
});

test("honors Pi's global directory override without changing the project path", async () => {
  const agentDirectory = path.join(tmpdir(), "theme-sync-custom-agent");
  const projectDirectory = path.join(tmpdir(), "theme-sync-project");

  vi.stubEnv("PI_CODING_AGENT_DIR", agentDirectory);
  vi.resetModules();

  const { CONFIG_PATHS } = await import("../src/config.js");

  expect(CONFIG_PATHS.global).toBe(
    path.join(agentDirectory, "theme-sync.json"),
  );

  expect(CONFIG_PATHS.project(projectDirectory)).toBe(
    path.join(projectDirectory, ".pi", "theme-sync.json"),
  );
});

test("uses Pi's tilde expansion for the global directory", async () => {
  vi.stubEnv("PI_CODING_AGENT_DIR", "~/theme-sync-custom-agent");
  vi.resetModules();

  const { CONFIG_PATHS } = await import("../src/config.js");

  expect(CONFIG_PATHS.global).toBe(
    path.join(homedir(), "theme-sync-custom-agent", "theme-sync.json"),
  );
});
