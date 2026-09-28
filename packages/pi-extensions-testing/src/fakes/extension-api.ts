/**
 * A stand-in for the `ExtensionAPI` Pi passes to an extension's default
 * export, which records what the extension registers and lets the test
 * run its commands and emit events to its handlers.
 */

import type {
  EntryRenderer,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionEvent,
} from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";

/** One `pi.appendEntry` call. */
export interface FakeEntry {
  readonly customType: string;
  readonly data: unknown;
}

/**
 * A fake `ExtensionAPI` and everything the extension registered through
 * it, keyed by name in registration order.
 */
export interface FakePi {
  /** Every `appendEntry` call, in order. */
  readonly appendedEntries: FakeEntry[];
  /** The registered command named `name`. Throws when there is none. */
  readonly command: (name: string) => FakeCommand;
  readonly commands: Map<string, FakeCommand>;
  /**
   * Call every handler registered for `event.type`, one at a time in
   * registration order, and resolve with their results in that order.
   */
  readonly emit: (
    event: ExtensionEvent,
    ctx: ExtensionContext,
  ) => Promise<unknown[]>;
  readonly entryRenderers: Map<string, EntryRenderer>;
  readonly flags: Map<string, FakeFlag>;
  readonly handlers: Map<string, FakeEventHandler[]>;
  /** Pass this to the extension's default export. */
  readonly pi: ExtensionAPI;
  /** Run the registered command named `name`, as `/name args` would. */
  readonly runCommand: (
    name: string,
    args: string,
    ctx: ExtensionCommandContext,
  ) => Promise<void>;
  readonly shortcuts: Map<KeyId, FakeShortcut>;
  readonly tools: Map<string, FakeTool>;
}

/** Options passed to `pi.registerCommand`. */
export type FakeCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

/** A handler passed to `pi.on`, whatever event it was registered for. */
export type FakeEventHandler = (
  event: ExtensionEvent,
  ctx: ExtensionContext,
) => unknown;

/** Options passed to `pi.registerFlag`. */
export type FakeFlag = Parameters<ExtensionAPI["registerFlag"]>[1];

/**
 * Replacements for the `ExtensionAPI` members the fake does not record.
 * `appendEntry` still records the entry, then calls the replacement.
 */
export type FakePiOverrides = Partial<Omit<ExtensionAPI, RecordingMember>>;

/** Options passed to `pi.registerShortcut`. */
export type FakeShortcut = Parameters<ExtensionAPI["registerShortcut"]>[1];

/** A tool passed to `pi.registerTool`. */
export type FakeTool = Parameters<ExtensionAPI["registerTool"]>[0];

/** Members the fake always implements itself, so it can record them. */
type RecordingMember =
  | "on"
  | "registerCommand"
  | "registerEntryRenderer"
  | "registerFlag"
  | "registerShortcut"
  | "registerTool";

/**
 * Build a fake `ExtensionAPI` that records registrations.
 *
 * Members it does not record behave like a session where nothing has
 * happened yet: no active tools, no flags passed, thinking `off`, and
 * `setModel` succeeding. `exec` rejects, since a test must script any
 * command it expects the extension to run.
 */
export function createFakePi(overrides: FakePiOverrides = {}): FakePi {
  const appendedEntries: FakeEntry[] = [];
  const commands = new Map<string, FakeCommand>();
  const entryRenderers = new Map<string, EntryRenderer>();
  const flags = new Map<string, FakeFlag>();
  const handlers = new Map<string, FakeEventHandler[]>();
  const shortcuts = new Map<KeyId, FakeShortcut>();
  const tools = new Map<string, FakeTool>();
  const { appendEntry, ...replacements } = overrides;
  const pi: ExtensionAPI = {
    appendEntry: (customType, data) => {
      appendedEntries.push({ customType, data });
      appendEntry?.(customType, data);
    },
    events: { emit: () => undefined, on: () => () => undefined },
    exec: (command) =>
      Promise.reject(new Error(`pi.exec("${command}") is not faked.`)),
    getActiveTools: () => [],
    getAllTools: () => [],
    getCommands: () => [],
    getFlag: () => undefined,
    getSessionName: () => undefined,
    getThinkingLevel: () => "off",
    on(event: string, handler: (event: never, ctx: never) => unknown) {
      // Pi calls a handler only with the event it was registered for.
      const registered = handler as FakeEventHandler;

      handlers.set(event, [...(handlers.get(event) ?? []), registered]);

      return () => {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((other) => other !== registered),
        );
      };
    },
    registerCommand: (name, options) => {
      commands.set(name, options);
    },
    registerEntryRenderer: (customType, renderer) => {
      entryRenderers.set(customType, renderer as EntryRenderer);
    },
    registerFlag: (name, options) => {
      flags.set(name, options);
    },
    registerMarkdownTransformer: () => undefined,
    registerMessageRenderer: () => undefined,
    registerProvider: () => undefined,
    registerShortcut: (shortcut, options) => {
      shortcuts.set(shortcut, options);
    },
    registerTool: (tool) => {
      tools.set(tool.name, tool as FakeTool);
    },
    sendMessage: () => undefined,
    sendUserMessage: () => undefined,
    setActiveTools: () => undefined,
    setLabel: () => undefined,
    setModel: () => Promise.resolve(true),
    setSessionName: () => undefined,
    setThinkingLevel: () => undefined,
    unregisterProvider: () => undefined,
    ...replacements,
  };
  const command = (name: string): FakeCommand => {
    const registered = commands.get(name);

    if (!registered) throw new Error(`/${name} is not registered.`);

    return registered;
  };

  return {
    appendedEntries,
    command,
    commands,
    emit: async (event, ctx) => {
      const results: unknown[] = [];

      for (const handler of handlers.get(event.type) ?? []) {
        results.push(await handler(event, ctx));
      }

      return results;
    },
    entryRenderers,
    flags,
    handlers,
    pi,
    runCommand: (name, args, ctx) => command(name).handler(args, ctx),
    shortcuts,
    tools,
  };
}
