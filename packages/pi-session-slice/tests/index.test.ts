/** Covers `/slice` registration, preconditions, orchestration, and failure reporting. */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeCustom,
  createFakeKeybindings,
  createShownTextRecorder,
  findShownTextViolations,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showStartPicker: vi.fn(),
  showEndPicker: vi.fn(),
  writeSliceFile: vi.fn(),
}));

vi.mock("../src/picker.js", () => ({
  showStartPicker: mocks.showStartPicker,
  showEndPicker: mocks.showEndPicker,
}));

vi.mock("../src/slice.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/slice.js")>()),
  writeSliceFile: mocks.writeSliceFile,
}));

const { default: sessionSlice } = await import("../src/index.js");
const actualPicker =
  await vi.importActual<typeof import("../src/picker.js")>("../src/picker.js");

const SOURCE_PATH = import.meta.filename;

const CANDIDATE_ENTRIES = [
  {
    type: "model_change" as const,
    id: "model",
    parentId: null,
    timestamp: "2026-03-10T11:59:00.000Z",
    provider: "anthropic",
    modelId: "claude-test",
  },
  {
    type: "message" as const,
    id: "u1",
    parentId: "model",
    timestamp: "2026-03-10T12:00:00.000Z",
    message: {
      role: "user" as const,
      content: "start",
      timestamp: 1,
    },
  },
  {
    type: "message" as const,
    id: "u2",
    parentId: "u1",
    timestamp: "2026-03-10T12:01:00.000Z",
    message: {
      role: "user" as const,
      content: "end",
      timestamp: 2,
    },
  },
];

function makeContext(
  overrides: Partial<{
    custom: ExtensionUIContext["custom"];
    header: { version?: number } | null;
    idle: boolean;
    mode: ExtensionCommandContext["mode"];
    contextEntries: typeof CANDIDATE_ENTRIES | [];
    sessionFile: string | undefined;
  }> = {},
): {
  ctx: ExtensionCommandContext;
  newNotify: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  setEditorText: ReturnType<typeof vi.fn>;
  switchSession: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const setEditorText = vi.fn();
  const newNotify = vi.fn();
  const newCtx = {
    ui: { notify: newNotify, setEditorText },
  } as unknown as ExtensionCommandContext;
  let stale = false;
  const switchSession = vi.fn(
    async (
      _path: string,
      options?: {
        withSession?: (ctx: ExtensionCommandContext) => Promise<void>;
      },
    ) => {
      await options?.withSession?.(newCtx);
      // Pi invalidates the original ctx once the old session is disposed.
      stale = true;

      return { cancelled: false };
    },
  );
  const ctx = {
    isIdle: () => overrides.idle ?? true,
    mode: overrides.mode ?? "tui",
    sessionManager: {
      getSessionFile: () =>
        "sessionFile" in overrides ? overrides.sessionFile : SOURCE_PATH,
      getHeader: () =>
        "header" in overrides ? overrides.header : { version: 3 },
      buildContextEntries: () => overrides.contextEntries ?? CANDIDATE_ENTRIES,
      getBranch: () => overrides.contextEntries ?? CANDIDATE_ENTRIES,
      getSessionDir: () => "/sessions",
      getCwd: () => "/project",
    },
    switchSession,
    ui: {
      custom: overrides.custom,
      notify: (message: string, type?: string) => {
        if (stale) throw new Error("This extension ctx is stale");

        notify(message, type);
      },
    },
  } as unknown as ExtensionCommandContext;

  return { ctx, newNotify, notify, setEditorText, switchSession };
}

function registeredCommand(): Pick<
  RegisteredCommand,
  "description" | "handler" | "name"
> {
  let command:
    Pick<RegisteredCommand, "description" | "handler" | "name"> | undefined;
  const pi = {
    registerCommand: vi.fn(
      (
        name: string,
        options: Pick<RegisteredCommand, "description" | "handler">,
      ) => {
        command = { ...options, name };
      },
    ),
  } as unknown as ExtensionAPI;

  sessionSlice(pi);

  if (!command) throw new Error("Command was not registered.");

  return command;
}

beforeEach(() => {
  mocks.showStartPicker.mockReset();
  mocks.showEndPicker.mockReset();
  mocks.writeSliceFile.mockReset();
  mocks.showStartPicker.mockResolvedValue({ id: "u1", kind: "message" });
  mocks.showEndPicker.mockResolvedValue({ id: "u2", kind: "message" });
  mocks.writeSliceFile.mockReturnValue("/sessions/slice.jsonl");
});

describe("sessionSlice", () => {
  it("registers the slice command", () => {
    const command = registeredCommand();

    expect(command.name).toBe("slice");
    expect(command.description).toBe(
      "Start a new session from a range of this one",
    );
  });

  it.each([
    [
      { sessionFile: undefined },
      "Session Slice: 1 warning\n- Slicing needs a session file to switch to, but Pi was started with --no-session.",
    ],
    [
      // Pi defers the first write until the assistant replies; an assigned
      // but unwritten path is fine, so a fresh session reports "no messages".
      {
        sessionFile: "/a/session/path/that/does/not/exist.jsonl",
        contextEntries: [],
      },
      "Session Slice: 1 warning\n- This session has no user messages yet, so there is nothing to slice.",
    ],
    [
      { idle: false },
      "Session Slice: 1 warning\n- The agent is still running. Wait for it to finish before slicing.",
    ],
    [
      { header: { version: 2 } },
      "Session Slice: 1 warning\n- This session uses unsupported format version 2.",
    ],
  ])("refuses an unsupported state", async (overrides, message) => {
    const command = registeredCommand();
    const { ctx, notify } = makeContext(overrides);

    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith(message, "warning");
    expect(mocks.showStartPicker).not.toHaveBeenCalled();
    expect(mocks.writeSliceFile).not.toHaveBeenCalled();
  });

  it.each(["rpc", "json", "print"] as const)(
    "warns instead of opening the picker in %s mode",
    async (mode) => {
      const command = registeredCommand();
      const { ctx, notify } = makeContext({ mode });

      await command.handler("", ctx);

      expect(notify).toHaveBeenCalledExactlyOnceWith(
        "Session Slice: 1 warning\n- /slice needs Pi's interactive terminal UI. Run it from the TUI.",
        "warning",
      );
      expect(mocks.showStartPicker).not.toHaveBeenCalled();
      expect(mocks.writeSliceFile).not.toHaveBeenCalled();
    },
  );

  it("refuses a context with no user messages", async () => {
    const command = registeredCommand();
    const { ctx, notify } = makeContext({ contextEntries: [] });

    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      "Session Slice: 1 warning\n- This session has no user messages yet, so there is nothing to slice.",
      "warning",
    );
    expect(mocks.showStartPicker).not.toHaveBeenCalled();
    expect(mocks.writeSliceFile).not.toHaveBeenCalled();
  });

  it("cancels before writing from either picker", async () => {
    const command = registeredCommand();
    const first = makeContext();

    mocks.showStartPicker.mockResolvedValueOnce({ kind: "cancel" });
    await command.handler("", first.ctx);

    const second = makeContext();

    mocks.showEndPicker.mockResolvedValueOnce({ kind: "cancel" });
    await command.handler("", second.ctx);

    expect(mocks.writeSliceFile).not.toHaveBeenCalled();
    expect(first.switchSession).not.toHaveBeenCalled();
    expect(second.switchSession).not.toHaveBeenCalled();
  });

  it("writes, switches, pre-fills the end message, and reports success", async () => {
    const command = registeredCommand();
    const { ctx, newNotify, notify, setEditorText, switchSession } =
      makeContext();

    await command.handler("", ctx);

    expect(mocks.writeSliceFile).toHaveBeenCalledTimes(1);
    expect(mocks.writeSliceFile).toHaveBeenCalledWith(
      "/sessions",
      "/project",
      SOURCE_PATH,
      expect.any(Array),
    );

    expect(switchSession).toHaveBeenCalledTimes(1);
    expect(switchSession.mock.calls[0]?.[0]).toBe("/sessions/slice.jsonl");
    expect(setEditorText).toHaveBeenCalledWith("end");
    // The original ctx is stale after the switch and must not be used.
    expect(notify).not.toHaveBeenCalled();
    expect(newNotify).toHaveBeenCalledWith(
      "Sliced 1 entry into a new session.",
      "info",
    );

    // Pi prints "Resumed session" as a status during the switch, and a later
    // info status replaces it; the success message must come after the switch.
    expect(newNotify.mock.invocationCallOrder[0]).toBeGreaterThan(
      switchSession.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("keeps the editor empty when slicing to the end", async () => {
    const command = registeredCommand();
    const { ctx, newNotify, setEditorText } = makeContext();

    mocks.showEndPicker.mockResolvedValueOnce({ kind: "end" });
    await command.handler("", ctx);

    expect(setEditorText).not.toHaveBeenCalled();
    expect(newNotify).toHaveBeenCalledWith(
      "Sliced 2 entries into a new session.",
      "info",
    );
  });

  it.each(["foo", "  status now  "])(
    "rejects the argument %j without slicing",
    async (args) => {
      const command = registeredCommand();
      const { ctx, notify } = makeContext();

      await command.handler(args, ctx);

      expect(notify).toHaveBeenCalledExactlyOnceWith(
        `Session Slice: 1 warning\n- Unknown subcommand "${args.trim()}". Try /slice.`,
        "warning",
      );
      expect(mocks.showStartPicker).not.toHaveBeenCalled();
      expect(mocks.writeSliceFile).not.toHaveBeenCalled();
    },
  );

  it("slices when the argument is only whitespace", async () => {
    const command = registeredCommand();
    const { ctx, switchSession } = makeContext();

    await command.handler("   ", ctx);

    expect(mocks.showStartPicker).toHaveBeenCalledTimes(1);
    expect(switchSession).toHaveBeenCalledTimes(1);
  });

  it("reports a write failure without switching", async () => {
    const command = registeredCommand();
    const { ctx, notify, switchSession } = makeContext();

    mocks.writeSliceFile.mockImplementationOnce(() => {
      throw new Error("read-only directory");
    });
    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      "Could not create the sliced session: read-only directory.",
      "error",
    );
    expect(switchSession).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure as an error notification", async () => {
    const command = registeredCommand();
    const { ctx, notify } = makeContext();

    mocks.showStartPicker.mockRejectedValueOnce(new Error("overlay closed"));
    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      "Session Slice command failed: overlay closed.",
      "error",
    );
  });

  it("reports the path when another extension cancels the switch", async () => {
    const command = registeredCommand();
    const { ctx, notify, switchSession } = makeContext();

    switchSession.mockResolvedValueOnce({ cancelled: true });
    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      "Session Slice: 1 warning\n- The sliced session was saved at /sessions/slice.jsonl, but Pi did not switch to it.",
      "warning",
    );
  });
});

describe("Session Slice shown text", () => {
  it("follows the family text standard on every /slice path", async () => {
    const shown = createShownTextRecorder();
    const command = registeredCommand();
    const rendered: string[] = [];
    // The real pickers: choose the first message, then end before the next.
    const custom = createFakeCustom({
      keybindings: createFakeKeybindings({
        "tui.select.confirm": "\r",
        "tui.select.up": "UP",
      }),
      keys: ["UP", "\r"],
      rendered,
    });
    const run = async (
      args: string,
      overrides: Parameters<typeof makeContext>[0] = {},
      switchCancelled = false,
    ): Promise<void> => {
      const { ctx, newNotify, notify, switchSession } = makeContext(overrides);

      notify.mockImplementation(shown.notify);
      newNotify.mockImplementation(shown.notify);

      if (switchCancelled)
        switchSession.mockResolvedValueOnce({ cancelled: true });

      await command.handler(args, ctx);
    };

    await shown.recordCommand(command);

    mocks.showStartPicker.mockImplementationOnce(actualPicker.showStartPicker);
    mocks.showEndPicker.mockImplementationOnce(actualPicker.showEndPicker);
    await run("", { custom });
    await run("foo");
    await run("", { mode: "rpc" });
    await run("", { sessionFile: undefined });
    await run("", { idle: false });
    await run("", { header: { version: 2 } });
    await run("", { contextEntries: [] });

    mocks.writeSliceFile.mockImplementationOnce(() => {
      throw new Error("read-only directory");
    });
    await run("");

    await run("", {}, true);

    mocks.showStartPicker.mockRejectedValueOnce(new Error("overlay closed"));
    await run("");

    for (const line of rendered) shown.record("text", line.trim());

    expect(shown.texts).toContainEqual({
      surface: "text",
      text: "Slice: start at message",
    });

    expect(shown.texts).toContainEqual({
      surface: "text",
      text: "Slice: end before message",
    });

    expect(shown.texts).toContainEqual({
      surface: "notification",
      text: "Sliced 1 entry into a new session.",
    });

    expect(
      findShownTextViolations(shown, {
        displayName: "Session Slice",
        slug: "session-slice",
      }),
    ).toEqual([]);
  });
});
