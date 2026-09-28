import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CONFIG_PATHS } from "../src/config.js";
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
  findShownTextViolations,
  type FakeCustomOptions,
  type ShownTextRecorder,
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

let testRoot: string;
let projectDirectory: string;
const originalUserConfigPath = CONFIG_PATHS.global;

beforeEach(async () => {
  testRoot = await mkdtemp(path.join(tmpdir(), "pi-theme-sync-shown-text-"));
  projectDirectory = path.join(testRoot, "project");
  CONFIG_PATHS.global = path.join(testRoot, "agent", "theme-sync.json");
  await mkdir(path.dirname(CONFIG_PATHS.global), { recursive: true });
  // An invalid User value makes setup show a configuration warning.
  await writeFile(CONFIG_PATHS.global, JSON.stringify({ isSyncActive: "no" }));
  vi.mocked(detectAppearanceViaColorScheme).mockResolvedValue("unknown");
  vi.mocked(detectAppearanceViaOsc11Background).mockResolvedValue("unknown");
  vi.mocked(detectAppearanceViaSystem).mockResolvedValue("unknown");
  vi.mocked(probeDecMode2031Support).mockResolvedValue("unsupported");
});

afterEach(async () => {
  CONFIG_PATHS.global = originalUserConfigPath;
  vi.resetAllMocks();
  await rm(testRoot, { force: true, recursive: true });
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
      expect.stringContaining("User setting"),
      expect.stringContaining("Saved 1 changed setting to User."),
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
    cwd: projectDirectory,
    hasUI: mode === "tui",
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
