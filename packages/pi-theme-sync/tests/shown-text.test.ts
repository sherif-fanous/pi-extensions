import path from "node:path";

import { detectAppearanceViaColorScheme } from "../src/detectors/pi/color-scheme.js";
import { detectAppearanceViaSystem } from "../src/detectors/system/appearance.js";
import { probeDecMode2031Support } from "../src/detectors/terminal/dec-mode-2031.js";
import { detectAppearanceViaOsc11Background } from "../src/detectors/terminal/osc-11.js";
import { EXTENSION_NAME } from "../src/extension-name.js";
import registerThemeSync from "../src/index.js";
import type {
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeCustom,
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

vi.mock("../src/detectors/pi/color-scheme.js", () => ({
  detectAppearanceViaColorScheme: vi.fn(),
  enableColorSchemeSubscription: vi.fn(),
  hasColorSchemeApi: () => false,
}));

vi.mock("../src/detectors/system/appearance.js", () => ({
  detectAppearanceViaSystem: vi.fn(),
}));

vi.mock("../src/detectors/terminal/dec-mode-2031.js", () => ({
  probeDecMode2031Support: vi.fn(),
}));

vi.mock("../src/detectors/terminal/osc-11.js", () => ({
  detectAppearanceViaOsc11Background: vi.fn(),
}));

type CommandOptions = Omit<RegisteredCommand, "name" | "sourceInfo">;

let dirs: TempConfigDirs;

beforeEach(async () => {
  dirs = await createTempConfigDirs();
  vi.stubEnv("PI_CODING_AGENT_DIR", dirs.agentDir);
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
  vi.mocked(detectAppearanceViaColorScheme).mockResolvedValue("unknown");
  vi.mocked(detectAppearanceViaOsc11Background).mockResolvedValue("unknown");
  vi.mocked(detectAppearanceViaSystem).mockResolvedValue("unknown");
  vi.mocked(probeDecMode2031Support).mockResolvedValue("unsupported");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  await dirs.cleanup();
});

test("everything Theme Sync shows follows the family text standard", async () => {
  const shown = createShownTextRecorder();
  const { command, emit } = registerWithRecorder(shown);

  await shown.recordCommand(command);

  const tui = commandContext(shown, "tui");

  await emit("session_start", tui);
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
  await emit("session_shutdown", tui);

  expect(shown.texts.map(({ text }) => text)).toEqual(
    expect.arrayContaining([
      expect.stringContaining(
        `${EXTENSION_NAME} migrated its configuration to `,
      ),
      expect.stringContaining("Skipped project configuration at "),
      expect.stringContaining('User setting "syncEnabled"'),
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
  return {
    cwd: dirs.cwd,
    hasUI: mode === "tui",
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
      theme: { ...createPlainTheme(), name: "dark" },
    },
  } as never;
}

function registerWithRecorder(shown: ShownTextRecorder): {
  command: CommandOptions;
  emit: (event: string, ctx: ExtensionCommandContext) => Promise<void>;
} {
  const commands: CommandOptions[] = [];
  const handlers = new Map<
    string,
    (event: unknown, ctx: ExtensionCommandContext) => unknown
  >();

  registerThemeSync({
    appendEntry: shown.appendEntry,
    on: (
      event: string,
      handler: (event: unknown, ctx: ExtensionCommandContext) => unknown,
    ) => {
      handlers.set(event, handler);
    },
    registerCommand: (_name: string, options: CommandOptions) => {
      commands.push(options);
    },
    registerEntryRenderer: vi.fn(),
  } as never);

  const [command] = commands;

  if (command === undefined) throw new Error("No command was registered.");

  return {
    command,
    emit: async (event, ctx) => {
      await handlers.get(event)?.({ type: event }, ctx);
    },
  };
}
