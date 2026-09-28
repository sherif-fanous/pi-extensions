/**
 * Runs the main paths of `/presets`, the `--preset` flag, and a preset
 * hotkey with every surface recorded, and checks everything Presets Plus
 * shows against the family's text and naming standard.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import presetsPlus from "../src/index.js";
import type { ThinkingLevel } from "../src/types.js";
import { makeStubModelRegistry } from "./helpers/model-registry.js";
import type {
  ExtensionCommandContext,
  ExtensionContext,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakeCustom,
  createFakePi,
  createShownTextRecorder,
  findShownTextViolations,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    let thinkingLevel: ThinkingLevel = "medium";
    let activeTools = ["read", "bash"];
    const fake = createFakePi({
      appendEntry: shown.appendEntry,
      getActiveTools: () => activeTools,
      getAllTools: () => ["bash", "read"].map((name) => ({ name }) as ToolInfo),
      getFlag: (name) => (name === "preset" ? "plan" : undefined),
      getThinkingLevel: () => thinkingLevel,
      setActiveTools: (tools) => {
        activeTools = tools;
      },
      setThinkingLevel: (level) => {
        thinkingLevel = level;
      },
    });
    const rendered: string[] = [];
    const context = (mode: ExtensionContext["mode"]): ExtensionCommandContext =>
      createFakeContext({
        cwd: join(agentDir, "project"),
        mode,
        modelRegistry: makeStubModelRegistry({
          models: { anthropic: { claude: { hasKey: true, reasoning: true } } },
        }),
        ui: {
          custom: createFakeCustom({ keys: ["\u001B"], rendered }),
          notify: shown.notify,
          select: shown.select,
          setStatus: shown.setStatus,
          setWidget: shown.setWidget,
        },
      });
    const tui = context("tui");

    presetsPlus(fake.pi);

    const presets = fake.command("presets");

    await shown.recordCommand(presets);

    for (const { description } of fake.flags.values()) {
      if (description !== undefined) shown.record("description", description);
    }

    await fake.emit({ reason: "startup", type: "session_start" }, tui);

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
      await presets.handler(args, tui);
    }

    await presets.handler("", context("print"));

    for (const { description, handler } of fake.shortcuts.values()) {
      if (description !== undefined) shown.record("description", description);

      await handler(tui);
    }

    for (const line of rendered) shown.record("text", line);

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
