/**
 * A stand-in for the context Pi passes to command and event handlers, for
 * an empty session whose UI answers like a user who cancels.
 */

import { createPlainTheme } from "./tui.js";
import type {
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionToolContext,
  ExtensionUIContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";

/**
 * What a test sets on the fake context. `sessionManager` and `ui` replace
 * single members, keeping the fake's other members.
 */
export interface FakeContextOptions extends Partial<
  Omit<ExtensionCommandContext, "sessionManager" | "ui">
> {
  readonly sessionManager?: Partial<FakeSessionManager>;
  readonly ui?: Partial<ExtensionUIContext>;
}

/** The read-only session manager a context exposes. */
export type FakeSessionManager = ExtensionContext["sessionManager"];

/**
 * Build a fake command context. It also serves as an event context.
 *
 * Defaults: mode `tui`, `hasUI` true in `tui` and `rpc` modes, cwd
 * `/project`, a trusted project, an idle agent with no model, and an
 * empty session without a file. `ui` shows nothing and answers like a
 * user who cancels: `select`, `input`, and `editor` resolve `undefined`
 * and `confirm` resolves `false`. `ui.custom` rejects, so pass one, such
 * as `createFakeCustom()`, when the extension opens an overlay. Session
 * changes such as `switchSession` resolve as not cancelled without
 * running their callbacks.
 */
export function createFakeContext(
  options: FakeContextOptions = {},
): ExtensionCommandContext {
  const { sessionManager, ui, ...members } = options;
  const mode = members.mode ?? "tui";
  const cwd = members.cwd ?? "/project";
  const notCancelled = (): Promise<{ cancelled: boolean }> =>
    Promise.resolve({ cancelled: false });

  return {
    abort: () => undefined,
    compact: () => undefined,
    cwd,
    fork: notCancelled,
    getContextUsage: () => undefined,
    getSystemPrompt: () => "",
    getSystemPromptOptions: () => ({ cwd }),
    hasPendingMessages: () => false,
    hasUI: mode === "tui" || mode === "rpc",
    isIdle: () => true,
    isProjectTrusted: () => true,
    mode,
    model: undefined,
    modelRegistry: createEmptyModelRegistry(),
    navigateTree: notCancelled,
    newSession: notCancelled,
    reload: () => Promise.resolve(),
    scopedModels: [],
    sessionManager: {
      ...createEmptySessionManager(cwd),
      ...sessionManager,
    },
    shutdown: () => undefined,
    signal: undefined,
    switchSession: notCancelled,
    ui: { ...createCancellingUi(), ...ui },
    waitForIdle: () => Promise.resolve(),
    ...members,
  };
}

/**
 * Build a fake tool context, the `ctx` Pi passes to a tool's `execute()`.
 *
 * It has the fake context's defaults, no callable tools, and an
 * `executeTool` that rejects, since no extension under test calls tools from
 * inside a tool yet.
 */
export function createFakeToolContext(
  options: FakeContextOptions = {},
): ExtensionToolContext {
  return {
    ...createFakeContext(options),
    executeTool: (name) =>
      Promise.reject(new Error(`ctx.executeTool("${name}") is not faked.`)),
    tools: [],
  };
}

function createCancellingUi(): ExtensionUIContext {
  return {
    addAutocompleteProvider: () => undefined,
    confirm: () => Promise.resolve(false),
    custom: () =>
      Promise.reject(
        new Error("ctx.ui.custom is not faked. Pass one to the context."),
      ),
    editor: () => Promise.resolve(undefined),
    getAllThemes: () => [],
    getEditorComponent: () => undefined,
    getEditorText: () => "",
    getTheme: () => undefined,
    getToolsExpanded: () => false,
    input: () => Promise.resolve(undefined),
    notify: () => undefined,
    onTerminalInput: () => () => undefined,
    pasteToEditor: () => undefined,
    select: () => Promise.resolve(undefined),
    setEditorComponent: () => undefined,
    setEditorText: () => undefined,
    setFooter: () => undefined,
    setHeader: () => undefined,
    setHiddenThinkingLabel: () => undefined,
    setStatus: () => undefined,
    setTheme: () => ({ success: true }),
    setTitle: () => undefined,
    setToolsExpanded: () => undefined,
    setWidget: () => undefined,
    setWorkingIndicator: () => undefined,
    setWorkingMessage: () => undefined,
    setWorkingVisible: () => undefined,
    theme: createPlainTheme(),
  };
}

/** A registry that knows no models. */
function createEmptyModelRegistry(): ModelRegistry {
  const registry: Pick<
    ModelRegistry,
    "find" | "getAll" | "getAvailable" | "getError" | "hasConfiguredAuth"
  > = {
    find: () => undefined,
    getAll: () => [],
    getAvailable: () => [],
    getError: () => undefined,
    hasConfiguredAuth: () => false,
  };

  // ModelRegistry is a class with a private field, so no plain object has
  // its type; extensions only look models up.
  return registry as ModelRegistry;
}

function createEmptySessionManager(cwd: string): FakeSessionManager {
  return {
    buildContextEntries: () => [],
    buildSessionProjection: () => ({
      entries: [],
      messages: [],
      model: null,
      thinkingLevel: "off",
    }),
    getBranch: () => [],
    getCwd: () => cwd,
    getEntries: () => [],
    getEntry: () => undefined,
    getHeader: () => null,
    getLabel: () => undefined,
    getLeafEntry: () => undefined,
    getLeafId: () => null,
    getSessionDir: () => "",
    getSessionFile: () => undefined,
    getSessionId: () => "fake-session",
    getSessionName: () => undefined,
    getTree: () => [],
  };
}
