/**
 * Builds a fake Pi that keeps the model, thinking level, and active tools
 * the activation code writes, with the session those writes attach to, so
 * tests can change Pi's values the way a user would and read what the
 * session makes of them.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset, ThinkingLevel } from "../../src/types.js";
import { makeStubModelRegistry } from "./model-registry.js";
import type { Api, Model, ThinkingLevelMap } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakePi,
  type FakeEntry,
} from "@sherif-fanous/pi-extensions-testing";

/** A fake Pi, its context, the session, and what they recorded. */
export interface PiHarness {
  readonly ctx: ExtensionCommandContext;
  /** Every `appendEntry` call, in order. */
  readonly entries: FakeEntry[];
  readonly notificationCalls: [string, string | undefined][];
  readonly notifications: string[];
  readonly pi: ExtensionAPI;
  readonly session: ActivePresetSession;
  readonly setModelCalls: string[];
  readonly setToolsCalls: string[][];
  readonly status: Record<string, string | undefined>;
  /** Switch Pi's model without going through the session, as `/model` does. */
  selectModel(provider: string, id: string): void;
}

/** How the fake Pi behaves. */
export interface PiHarnessOptions {
  /** Tools Pi has, `bash` and `read` by default. */
  readonly allTools?: readonly string[];
  /** The directory presets load from, the process's by default. */
  readonly cwd?: string;
  /** A model id `setModel` refuses. */
  readonly failModel?: string;
  /** Called after each `setModel` Pi accepts, as Pi fires `model_select`. */
  readonly onModelSet?: () => void;
  /** Called after each `setThinkingLevel`, as Pi fires its event. */
  readonly onThinkingLevelSet?: () => void;
  /** Whether `anthropic/claude` reasons, `true` by default. */
  readonly reasoning?: boolean;
  /** A model id `setModel` throws on. */
  readonly rejectModel?: string;
  /** The level Pi switches to when it changes model. */
  readonly thinkingAfterModelSet?: ThinkingLevel;
  readonly thinkingLevelMap?: ThinkingLevelMap;
}

/**
 * Build a fake Pi on `anthropic/old` at thinking `medium` with `bash`
 * active, outside the TUI so command reports arrive as notifications.
 */
export function makePiHarness(options: PiHarnessOptions = {}): PiHarness {
  let thinkingLevel: ThinkingLevel = "medium";
  let tools = ["bash"];
  const notifications: string[] = [];
  const notificationCalls: [string, string | undefined][] = [];
  const setModelCalls: string[] = [];
  const setToolsCalls: string[][] = [];
  const status: Record<string, string | undefined> = {};
  const ctx = createFakeContext({
    cwd: options.cwd ?? process.cwd(),
    mode: "print",
    model: model("anthropic", "old"),
    modelRegistry: makeStubModelRegistry({
      models: {
        anthropic: {
          claude: {
            hasKey: true,
            reasoning: options.reasoning ?? true,
            ...(options.thinkingLevelMap === undefined
              ? {}
              : { thinkingLevelMap: options.thinkingLevelMap }),
          },
          old: { hasKey: true, reasoning: true },
          opus: { hasKey: true, reasoning: true },
        },
        openai: { gpt: { hasKey: true, reasoning: true } },
      },
    }),
    ui: {
      notify(message, severity) {
        notifications.push(message);
        notificationCalls.push([message, severity]);
      },
      setStatus(key, value) {
        status[key] = value;
      },
    },
  });
  const fake = createFakePi({
    getActiveTools: () => tools,
    getAllTools: () =>
      (options.allTools ?? ["bash", "read"]).map(
        (name) => ({ name }) as ToolInfo,
      ),
    getThinkingLevel: () => thinkingLevel,
    setActiveTools(nextTools) {
      tools = nextTools;
      setToolsCalls.push(nextTools);
    },
    setModel(nextModel) {
      setModelCalls.push(`${nextModel.provider}/${nextModel.id}`);

      if (nextModel.id === options.failModel) return Promise.resolve(false);

      if (nextModel.id === options.rejectModel) {
        return Promise.reject(new Error("Model restoration failed."));
      }

      ctx.model = nextModel;
      thinkingLevel = options.thinkingAfterModelSet ?? thinkingLevel;
      options.onModelSet?.();

      return Promise.resolve(true);
    },
    setThinkingLevel(nextLevel) {
      thinkingLevel = nextLevel;
      options.onThinkingLevelSet?.();
    },
  });

  return {
    ctx,
    entries: fake.appendedEntries,
    notificationCalls,
    notifications,
    pi: fake.pi,
    selectModel(provider, id) {
      ctx.model = model(provider, id);
    },
    session: new ActivePresetSession(),
    setModelCalls,
    setToolsCalls,
    status,
  };
}

/**
 * Reattach `preset` the way session start does on resume, from a branch
 * whose last entry names it.
 */
export function reattach(harness: PiHarness, preset: LoadedPreset): void {
  harness.session.restoreFromBranch(
    [
      {
        customType: "presets-plus:active",
        data: { name: preset.name, scope: preset.scope },
        type: "custom",
      },
    ] as ReturnType<ExtensionCommandContext["sessionManager"]["getBranch"]>,
    [preset],
    harness.ctx,
  );
}

function model(provider: string, id: string): Model<Api> {
  return { id, provider, reasoning: true } as Model<Api>;
}
