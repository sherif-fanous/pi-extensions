/**
 * Points Pi's agent directory at an empty temporary directory for each test
 * file, so no test reads or migrates the real User configuration.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll } from "vitest";

const agentDir = await mkdtemp(path.join(tmpdir(), "pi-theme-sync-agent-"));

process.env.PI_CODING_AGENT_DIR = agentDir;

afterAll(async () => {
  await rm(agentDir, { force: true, recursive: true });
});
