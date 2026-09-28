/**
 * Covers the configuration outcome a load returns: the startup info line
 * and warning notification in their fixed order, the status report's
 * `Config:` block, and the warnings a status report lists.
 */
import { join } from "node:path";

import {
  defineConfigFile,
  type ConfigFileHandle,
  type GuardContext,
} from "../../src/index.js";
import {
  createProjectTrustContext,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dirs: TempConfigDirs;
let handle: ConfigFileHandle<"project" | "user">;
let userPath: string;
let projectPath: string;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  handle = defineConfigFile({
    extension: "theme-sync",
    extensionName: "Theme Sync",
    scopes: ["user", "project"],
    version: 2,
  });
  userPath = join(dirs.agentDir, "theme-sync", "config.json");
  projectPath = join(dirs.cwd, ".pi", "theme-sync", "config.json");
});

afterEach(async () => {
  await dirs.cleanup();
});

function load(trusted = true) {
  return handle.load(createProjectTrustContext(dirs.cwd, trusted));
}

function notifyingContext(): {
  ctx: GuardContext;
  notify: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();

  return { ctx: { ui: { notify } }, notify };
}

describe("notify", () => {
  it("shows nothing when nothing migrated and nothing is wrong", async () => {
    const { ctx, notify } = notifyingContext();

    (await load()).notify(ctx);

    expect(notify).not.toHaveBeenCalled();
  });

  it("names one migrated file in one info message", async () => {
    const { ctx, notify } = notifyingContext();

    (await load())
      .withMigrations({ migrated: ["/a/config.json"], warnings: [] })
      .notify(ctx);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Theme Sync migrated its configuration to /a/config.json.",
      "info",
    );
  });

  it("joins two migrated files with and, across migrations", async () => {
    const { ctx, notify } = notifyingContext();

    (await load())
      .withMigrations(
        { migrated: ["/a/config.json"], warnings: [] },
        { migrated: ["/b/config.json"], warnings: [] },
      )
      .notify(ctx);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Theme Sync migrated its configuration to /a/config.json and /b/config.json.",
      "info",
    );
  });

  it("lists three migrated files with a serial comma", async () => {
    const { ctx, notify } = notifyingContext();

    (await load())
      .withMigrations({ migrated: ["/a", "/b"], warnings: [] })
      .withMigrations({ migrated: ["/c"], warnings: [] })
      .notify(ctx);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Theme Sync migrated its configuration to /a, /b, and /c.",
      "info",
    );
  });

  it("sends the info message, then one warning notification in a fixed order", async () => {
    await dirs.writeJson(userPath, { version: 9 });
    await dirs.writeJson(projectPath, {});

    const { ctx, notify } = notifyingContext();

    (await load(false))
      .withValueWarnings(["Value one."])
      .withMigrations({ migrated: ["/a"], warnings: ["Migration one."] })
      .withValueWarnings(["Value two."])
      .notify(ctx, ["Extra one."]);

    expect(notify.mock.calls).toEqual([
      ["Theme Sync migrated its configuration to /a.", "info"],
      [
        [
          "Theme Sync: 6 warnings",
          "- Migration one.",
          `- Configuration at ${userPath} has version 9, but only version 2 is supported. Ignored the file.`,
          `- Skipped project configuration at ${projectPath} because the project is not trusted. Trust the project to use it.`,
          "- Value one.",
          "- Value two.",
          "- Extra one.",
        ].join("\n"),
        "warning",
      ],
    ]);
  });

  it("leaves the outcome it was derived from unchanged", async () => {
    const outcome = await load();
    const { ctx, notify } = notifyingContext();

    outcome.withMigrations({ migrated: ["/a"], warnings: ["Failed."] });
    outcome.withValueWarnings(["Invalid."]);
    outcome.notify(ctx);

    expect(notify).not.toHaveBeenCalled();
    expect(outcome.migrated).toEqual([]);
    expect(outcome.migrationWarnings).toEqual([]);
    expect(outcome.valueWarnings).toEqual([]);
  });
});

describe("statusLines", () => {
  it("lists User before Project with the state and then the path", async () => {
    await dirs.writeJson(userPath, {});
    await dirs.writeJson(projectPath, {});

    expect((await load(false)).statusLines).toEqual([
      "Config:",
      "  User:    loaded",
      `           ${userPath}`,
      "  Project: skipped (untrusted)",
      `           ${projectPath}`,
    ]);
  });

  it("words missing and invalid files", async () => {
    await dirs.writeJson(projectPath, []);

    expect((await load()).statusLines).toEqual([
      "Config:",
      "  User:    not found",
      `           ${userPath}`,
      "  Project: invalid: not a JSON object",
      `           ${projectPath}`,
    ]);
  });

  it("aligns a lone User row on its own label", async () => {
    const userOnly = defineConfigFile({
      extension: "theme-sync",
      extensionName: "Theme Sync",
      scopes: ["user"],
      version: 2,
    });

    expect(
      (await userOnly.load(createProjectTrustContext(dirs.cwd, true)))
        .statusLines,
    ).toEqual(["Config:", "  User: not found", `        ${userPath}`]);
  });
});

describe("warnings", () => {
  it("lists migration, file, and value warnings in the order notify shows them", async () => {
    await dirs.writeJson(userPath, { version: 9 });

    const outcome = (await load())
      .withValueWarnings(["Invalid value."])
      .withMigrations({ migrated: [], warnings: ["Failed migration."] });

    expect(outcome.warnings).toEqual([
      "Failed migration.",
      `Configuration at ${userPath} has version 9, but only version 2 is supported. Ignored the file.`,
      "Invalid value.",
    ]);
  });
});

describe("statusWarnings", () => {
  it("lists migration warnings, then value warnings, leaving file problems to the Config block", async () => {
    await dirs.writeJson(userPath, { version: 9 });

    const outcome = (await load())
      .withValueWarnings(["Invalid value."])
      .withMigrations({ migrated: [], warnings: ["Failed migration."] });

    expect(outcome.statusWarnings).toEqual([
      "Failed migration.",
      "Invalid value.",
    ]);
  });
});
