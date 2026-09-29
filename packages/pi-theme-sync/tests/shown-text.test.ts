import path from "node:path";

import { EXTENSION_NAME } from "../src/extension-name.js";
import registerThemeSync from "../src/index.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakeCustom,
  createFakePi,
  createPiKeybindings,
  createPlainTheme,
  createShownTextRecorder,
  createTempConfigDirs,
  findShownTextViolations,
  type FakeCustomOptions,
  type ShownTextRecorder,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Theme Sync's own detectors and their text, with every probe finding
// nothing, so the startup warnings are the same on every machine.
vi.mock("../src/detectors/index.js", async (importOriginal) => {
  const detectors =
    await importOriginal<typeof import("../src/detectors/index.js")>();
  const { polling, subscription } = detectors.THEME_SYNC_DETECTORS;

  return {
    ...detectors,
    THEME_SYNC_DETECTORS: {
      polling: polling.map((detector) => ({
        ...detector,
        detect: () => Promise.resolve("unknown"),
      })),
      subscription: subscription.map((detector) => ({
        ...detector,
        isSupported: () => Promise.resolve(false),
      })),
    },
  };
});

let dirs: TempConfigDirs;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  // An old User file migrates, and its invalid value shows a warning.
  await dirs.writeJson(
    path.join(dirs.agentDir, "theme-sync", "settings.json"),
    { isSyncActive: "no" },
  );

  // The project is untrusted, so its file is skipped with a warning.
  await dirs.writeJson(
    path.join(dirs.cwd, ".pi", "theme-sync", "config.json"),
    {},
  );
});

afterEach(async () => {
  await dirs.cleanup();
});

test("everything Theme Sync shows follows the family text standard", async () => {
  const shown = createShownTextRecorder();
  const fake = createFakePi({ appendEntry: shown.appendEntry });

  registerThemeSync(fake.pi);

  const command = fake.command("theme-sync");

  await shown.recordCommand(command);

  const tui = commandContext(shown, "tui");

  await fake.emit({ reason: "startup", type: "session_start" }, tui);
  await command.handler("status", tui);
  await command.handler("status foo", tui);
  await command.handler("unknown", tui);
  await command.handler("", commandContext(shown, "print"));
  await command.handler("status", commandContext(shown, "print"));
  await command.handler(
    "",
    commandContext(shown, "tui", async (overlay) => {
      const record = (): void => {
        for (const line of overlay.render(100)) shown.record("text", line);
      };

      // Pick the second theme for Light mode theme, then save to User.
      for (const key of ["\r", "\x1b[B", "\r"]) overlay.handleInput?.(key);
      record();
      overlay.handleInput?.("\x13");
      await vi.waitFor(() => {
        expect(overlay.render(100).join("\n")).toContain("User (");
      });
      record();
      overlay.handleInput?.("\x1b[B");
      overlay.handleInput?.("\r");
      await vi.waitFor(() => {
        expect(overlay.render(100).join("\n")).toContain("Saved 1 ");
      });
      record();
      overlay.handleInput?.("\x1b");
    }),
  );
  await fake.emit({ reason: "quit", type: "session_shutdown" }, tui);

  expect(shown.texts.map(({ text }) => text)).toEqual(
    expect.arrayContaining([
      expect.stringContaining(
        `${EXTENSION_NAME} migrated its configuration to `,
      ),
      expect.stringContaining("Skipped project configuration at "),
      expect.stringContaining('User setting "syncEnabled"'),
      expect.stringContaining("Terminal color-scheme API is unavailable"),
      expect.stringContaining("Config:"),
      expect.stringContaining(
        "Saved 1 changed setting to User. Press Ctrl+R to reload and apply.",
      ),
      expect.stringContaining(`${EXTENSION_NAME} Status`),
      expect.stringContaining('Unknown subcommand "status foo"'),
    ]),
  );

  expect(
    findShownTextViolations(shown, {
      displayName: EXTENSION_NAME,
      slug: "theme-sync",
    }),
  ).toEqual([]);
});

function commandContext(
  shown: ShownTextRecorder,
  mode: ExtensionCommandContext["mode"],
  onMount?: FakeCustomOptions["onMount"],
): ExtensionCommandContext {
  return createFakeContext({
    cwd: dirs.cwd,
    isProjectTrusted: () => false,
    mode,
    reload: vi.fn(),
    ui: {
      custom: createFakeCustom({
        keybindings: createPiKeybindings(),
        onMount,
      }),
      getAllThemes: () => [
        { name: "light", path: undefined },
        { name: "dark", path: undefined },
      ],
      notify: shown.notify,
      setStatus: shown.setStatus,
      setTheme: vi.fn(() => ({ success: true })),
      setWidget: shown.setWidget,
      theme: Object.assign(createPlainTheme(), { name: "dark" }),
    },
  });
}
