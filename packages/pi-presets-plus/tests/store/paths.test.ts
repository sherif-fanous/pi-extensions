/**
 * Covers where the configuration, legacy presets, and legacy policy files
 * land for each scope, using synthetic agent and cwd values.
 */
import {
  getConfigPath,
  getProjectPresetsPath,
  getUserPolicyPath,
  getUserPresetsPath,
} from "../../src/store/paths.js";
import { describe, expect, it } from "vitest";

describe("getUserPresetsPath", () => {
  it("resolves under the provided agent dir", () => {
    expect(getUserPresetsPath("/tmp/fake-agent")).toBe(
      "/tmp/fake-agent/presets-plus/presets.json",
    );
  });

  it("uses pi's getAgentDir() when no override is provided", () => {
    // The agent dir varies by machine, so the assertions check only that
    // the result is absolute and keeps the expected suffix.
    const resolved = getUserPresetsPath();

    expect(resolved.endsWith("/presets-plus/presets.json")).toBe(true);
    expect(resolved.startsWith("/")).toBe(true);
  });
});

describe("getConfigPath", () => {
  it("resolves the user file beside the legacy presets and policy files", () => {
    expect(getConfigPath("user", "/tmp/fake-project", "/tmp/fake-agent")).toBe(
      "/tmp/fake-agent/presets-plus/config.json",
    );
  });

  it("resolves the project file under <cwd>/.pi/presets-plus/", () => {
    expect(
      getConfigPath("project", "/tmp/fake-project", "/tmp/fake-agent"),
    ).toBe("/tmp/fake-project/.pi/presets-plus/config.json");
  });
});

describe("getUserPolicyPath", () => {
  it("resolves under the provided agent dir", () => {
    expect(getUserPolicyPath("/tmp/fake-agent")).toBe(
      "/tmp/fake-agent/presets-plus/policy.json",
    );
  });
});

describe("getProjectPresetsPath", () => {
  it("resolves under <cwd>/.pi/presets-plus/", () => {
    expect(getProjectPresetsPath("/tmp/fake-project")).toBe(
      "/tmp/fake-project/.pi/presets-plus/presets.json",
    );
  });
});
