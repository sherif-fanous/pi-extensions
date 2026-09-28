/**
 * Runs the main paths of `/presets`, the `--preset` flag, and a preset
 * hotkey with every surface recorded, and checks everything Presets Plus
 * shows against the family's text and naming standard.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import presetsPlus from "../src/index.js";
import { makeStubModelRegistry } from "./helpers/model-registry.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import {
  createPlainTheme,
  createShownTextRecorder,
  findShownTextViolations,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type CommandOptions = Omit<RegisteredCommand, "name" | "sourceInfo">;
type SessionStartHandler = (
  event: { type: "session_start" },
  ctx: ExtensionContext,
) => Promise<void>;
type ShortcutHandler = (ctx: ExtensionContext) => Promise<void> | void;

let agentDir: string;
let previousAgentDir: string | undefined;

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "pi-presets-shown-text-"));
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(join(agentDir, "presets-plus"), { recursive: true });
  await writeFile(
    join(agentDir, "presets-plus", "config.json"),
    JSON.stringify({
      policy: { rules: [{ allow: [{ pattern: "." }], match: "." }] },
      presets: [
        {
          hotkey: "ctrl+alt+p",
          instructions: "Plan before you edit.",
          model: "claude",
          name: "plan",
          provider: "anthropic",
          tools: ["read"],
        },
        { model: "claude", name: "notes", provider: "anthropic" },
      ],
      version: 2,
    }),
  );
});

afterEach(async () => {
  if (previousAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }

  await rm(agentDir, { force: true, recursive: true });
});

describe("shown text", () => {
  it("follows the text and naming standard on the main paths", async () => {
    const shown = createShownTextRecorder();
    const commands = new Map<string, CommandOptions>();
    const shortcuts: ShortcutHandler[] = [];
    let sessionStart: SessionStartHandler | undefined;
    let thinkingLevel: ReturnType<ExtensionAPI["getThinkingLevel"]> = "medium";
    let activeTools = ["read", "bash"];
    const pi: Pick<
      ExtensionAPI,
      | "appendEntry"
      | "getActiveTools"
      | "getAllTools"
      | "getFlag"
      | "getThinkingLevel"
      | "on"
      | "registerCommand"
      | "registerEntryRenderer"
      | "registerFlag"
      | "registerShortcut"
      | "setActiveTools"
      | "setModel"
      | "setThinkingLevel"
    > = {
      appendEntry: shown.appendEntry,
      getActiveTools: () => activeTools,
      getAllTools: () =>
        [{ name: "bash" }, { name: "read" }] as ReturnType<
          ExtensionAPI["getAllTools"]
        >,
      getFlag: (name) => (name === "preset" ? "plan" : undefined),
      getThinkingLevel: () => thinkingLevel,
      on: (event: string, handler: unknown) => {
        if (event === "session_start") {
          sessionStart = handler as SessionStartHandler;
        }

        return () => undefined;
      },
      registerCommand: (name, options) => {
        commands.set(name, options);
      },
      registerEntryRenderer: () => undefined,
      registerFlag: (_name, options) => {
        if (options.description !== undefined) {
          shown.record("description", options.description);
        }
      },
      registerShortcut: (_key, { description, handler }) => {
        if (description !== undefined) shown.record("description", description);

        shortcuts.push(handler);
      },
      setActiveTools: (tools) => {
        activeTools = tools;
      },
      setModel: () => Promise.resolve(true),
      setThinkingLevel: (level) => {
        thinkingLevel = level;
      },
    };
    const context = (
      mode: ExtensionContext["mode"],
    ): ExtensionCommandContext => {
      const ctx: Pick<
        ExtensionCommandContext,
        "cwd" | "isProjectTrusted" | "mode" | "model" | "modelRegistry"
      > & {
        sessionManager: Pick<ExtensionContext["sessionManager"], "getBranch">;
        ui: Pick<
          ExtensionContext["ui"],
          "notify" | "select" | "setStatus" | "setWidget" | "theme"
        >;
      } = {
        cwd: join(agentDir, "project"),
        isProjectTrusted: () => true,
        mode,
        model: undefined,
        modelRegistry: makeStubModelRegistry({
          models: { anthropic: { claude: { hasKey: true, reasoning: true } } },
        }),
        sessionManager: { getBranch: () => [] },
        ui: {
          notify: shown.notify,
          select: shown.select,
          setStatus: shown.setStatus,
          setWidget: shown.setWidget,
          theme: createPlainTheme(),
        },
      };

      return ctx as ExtensionCommandContext;
    };
    const tui = context("tui");

    presetsPlus(pi as ExtensionAPI);

    const presets = commands.get("presets");

    await shown.recordCommand(presets ?? {});
    await sessionStart?.({ type: "session_start" }, tui);

    for (const args of [
      "status",
      "policy",
      "reload",
      "show-prompt",
      "show-prompt notes",
      "show-prompt missing",
      "status foo",
      "clear",
      "clear",
      "notes",
    ]) {
      await presets?.handler(args, tui);
    }

    await presets?.handler("", context("print"));

    for (const shortcut of shortcuts) await shortcut(tui);

    expect(
      findShownTextViolations(shown, {
        displayName: "Presets Plus",
        slug: "presets-plus",
      }),
    ).toEqual([]);

    expect(shown.texts.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        'Presets Plus applied preset "plan".',
        'Preset "notes" applied.',
        expect.stringMatching(/^Presets Plus Status\n/),
        expect.stringMatching(/^Presets Plus Policy\n/),
        expect.stringMatching(/^Presets Plus Cleared\n/),
      ]),
    );
  });
});
