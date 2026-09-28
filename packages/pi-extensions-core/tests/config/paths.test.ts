import { join } from "node:path";

import { extensionConfigPath, projectConfigPath } from "../../src/index.js";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

describe("extensionConfigPath", () => {
  it("joins the agent dir, extension, and file", () => {
    expect(
      extensionConfigPath({
        agentDir: "/tmp/agent",
        extension: "theme-sync",
        file: "settings.json",
      }),
    ).toBe("/tmp/agent/theme-sync/settings.json");
  });
});

describe("projectConfigPath", () => {
  it("joins the cwd, Pi's config dir, extension, and file", () => {
    expect(
      projectConfigPath({
        cwd: "/tmp/project",
        extension: "theme-sync",
        file: "settings.json",
      }),
    ).toBe(
      join("/tmp/project", CONFIG_DIR_NAME, "theme-sync", "settings.json"),
    );
  });
});
