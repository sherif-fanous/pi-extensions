import { configStatusLines, type ConfigFile } from "../../src/index.js";
import { describe, expect, it } from "vitest";

const USER_PATH = "/home/me/.pi/agent/theme-sync/config.json";
const PROJECT_PATH = "/repo/.pi/theme-sync/config.json";

describe("configStatusLines", () => {
  it("lists User before Project with the state and then the path", () => {
    const files: ConfigFile[] = [
      {
        path: PROJECT_PATH,
        scope: "project",
        state: "untrusted",
        warning: "unused",
      },
      {
        data: {},
        path: USER_PATH,
        renamedKeys: [],
        scope: "user",
        state: "loaded",
      },
    ];

    expect(configStatusLines(files)).toEqual([
      "Config:",
      "  User:    loaded",
      `           ${USER_PATH}`,
      "  Project: skipped (untrusted)",
      `           ${PROJECT_PATH}`,
    ]);
  });

  it("words missing and invalid files", () => {
    expect(
      configStatusLines([
        { path: USER_PATH, scope: "user", state: "missing" },
        {
          path: PROJECT_PATH,
          reason: "not a JSON object",
          scope: "project",
          state: "invalid",
          warning: "unused",
        },
      ]),
    ).toEqual([
      "Config:",
      "  User:    not found",
      `           ${USER_PATH}`,
      "  Project: invalid: not a JSON object",
      `           ${PROJECT_PATH}`,
    ]);
  });

  it("aligns a lone User row on its own label", () => {
    expect(
      configStatusLines([{ path: USER_PATH, scope: "user", state: "missing" }]),
    ).toEqual(["Config:", "  User: not found", `        ${USER_PATH}`]);
  });
});
