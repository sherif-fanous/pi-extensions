import path from "node:path";

import { openThemeSyncOverlay } from "../src/command.js";
import { CONFIG_VERSION } from "../src/config/load.js";
import { createThemeSyncRuntime } from "../src/runtime.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  createFakeCustom,
  createPiKeybindings,
  createTempConfigDirs,
  stripAnsi,
  type CustomComponent,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const ENTER = "\r";
const DOWN = "\x1b[B";
const CTRL_S = "\x13";

let dirs: TempConfigDirs;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  vi.stubEnv("PI_CODING_AGENT_DIR", dirs.agentDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await dirs.cleanup();
});

test("offers each scope's config.json under the agent directory override", async () => {
  await withOverlay(true, (overlay) => {
    overlay.handleInput?.(CTRL_S);

    const rendered = stripAnsi(overlay.render(240).join("\n"));

    expect(rendered).toContain(`Project (${projectPath()})`);
    expect(rendered).toContain(`User (${userPath()})`);
  });
});

test("saves a changed setting to config.json with the current version", async () => {
  await dirs.writeJson(userPath(), { keepThis: true });

  await withOverlay(true, async (overlay) => {
    // Pick "dark" for Light mode theme, then save to User.
    for (const key of [ENTER, DOWN, ENTER, CTRL_S, DOWN, ENTER]) {
      overlay.handleInput?.(key);
    }

    await vi.waitFor(() =>
      expect(stripAnsi(overlay.render(240).join("\n"))).toContain(
        "Saved 1 changed setting to User. Press Ctrl+R to reload and apply.",
      ),
    );
  });

  expect(await dirs.readJson(userPath())).toEqual({
    keepThis: true,
    themes: { light: "dark" },
    version: CONFIG_VERSION,
  });
});

test("refuses to save to an untrusted project and keeps the edit", async () => {
  await withOverlay(false, async (overlay) => {
    for (const key of [ENTER, DOWN, ENTER, CTRL_S, ENTER]) {
      overlay.handleInput?.(key);
    }

    await vi.waitFor(() =>
      expect(stripAnsi(overlay.render(400).join("\n"))).toContain(
        `Could not save the configuration: The project is not trusted, so ${projectPath()} was not saved. Trust the project and try again.`,
      ),
    );

    expect(stripAnsi(overlay.render(400).join("\n"))).toMatch(
      /Light mode theme\s+dark/,
    );
  });

  expect(await dirs.exists(projectPath())).toBe(false);
});

function projectPath(): string {
  return path.join(dirs.cwd, ".pi", "theme-sync", "config.json");
}

function userPath(): string {
  return path.join(dirs.agentDir, "theme-sync", "config.json");
}

async function withOverlay(
  trusted: boolean,
  exercise: (overlay: CustomComponent) => Promise<void> | void,
): Promise<void> {
  const custom = createFakeCustom({
    keybindings: createPiKeybindings(),
    onMount: async (overlay, done) => {
      try {
        await exercise(overlay);
      } finally {
        done(undefined);
      }
    },
  });
  const reload = vi.fn();
  const ctx = {
    cwd: dirs.cwd,
    isProjectTrusted: () => trusted,
    mode: "tui",
    reload,
    ui: {
      custom,
      getAllThemes: () => [{ name: "light" }, { name: "dark" }],
      notify: vi.fn(),
    },
  } as unknown as ExtensionCommandContext;

  await openThemeSyncOverlay(createThemeSyncRuntime(), ctx);
  expect(reload).not.toHaveBeenCalled();
}
