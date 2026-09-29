/** Covers `/slice` registration, preconditions, orchestration, and failure reporting. */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { SliceCandidate } from "../src/slice.js";
import type {
  ExtensionCommandContext,
  ExtensionUIContext,
  SessionEntry,
  SessionHeader,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakeCustom,
  createFakeKeybindings,
  createFakePi,
  createShownTextRecorder,
  findShownTextViolations,
  type FakeCommand,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showStartPicker: vi.fn(),
  showEndPicker: vi.fn(),
}));

vi.mock("../src/ui/picker.js", () => ({
  showStartPicker: mocks.showStartPicker,
  showEndPicker: mocks.showEndPicker,
}));

const { default: sessionSlice } = await import("../src/index.js");
const actualPicker = await vi.importActual<
  typeof import("../src/ui/picker.js")
>("../src/ui/picker.js");

/** The context Pi passes to the `withSession` callback of `switchSession`. */
type ReplacedSessionContext = Parameters<
  NonNullable<
    NonNullable<
      Parameters<ExtensionCommandContext["switchSession"]>[1]
    >["withSession"]
  >
>[0];

const SOURCE_PATH = import.meta.filename;

const SOURCE_HEADER: SessionHeader = {
  cwd: "/project",
  id: "source",
  timestamp: "2026-03-10T11:58:00.000Z",
  type: "session",
  version: 3,
};

const CANDIDATE_ENTRIES: SessionEntry[] = [
  {
    type: "model_change",
    id: "model",
    parentId: null,
    timestamp: "2026-03-10T11:59:00.000Z",
    provider: "anthropic",
    modelId: "claude-test",
  },
  {
    type: "message",
    id: "u1",
    parentId: "model",
    timestamp: "2026-03-10T12:00:00.000Z",
    message: {
      role: "user",
      content: "start",
      timestamp: 1,
    },
  },
  {
    type: "message",
    id: "u2",
    parentId: "u1",
    timestamp: "2026-03-10T12:01:00.000Z",
    message: {
      role: "user",
      content: "end",
      timestamp: 2,
    },
  },
];

const START_CANDIDATE: SliceCandidate = {
  id: "u1",
  ordinal: 1,
  text: "start",
  timestamp: "2026-03-10T12:00:00.000Z",
  total: 2,
};

const END_CANDIDATE: SliceCandidate = {
  id: "u2",
  ordinal: 2,
  text: "end",
  timestamp: "2026-03-10T12:01:00.000Z",
  total: 2,
};

const temporaryDirectories: string[] = [];

function makeContext(
  overrides: Partial<{
    custom: ExtensionUIContext["custom"];
    header: { version?: number } | null;
    idle: boolean;
    mode: ExtensionCommandContext["mode"];
    contextEntries: SessionEntry[];
    sessionDirMissing: boolean;
    sessionFile: string | undefined;
  }> = {},
): {
  ctx: ExtensionCommandContext;
  newNotify: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  sessionDir: string;
  setEditorText: ReturnType<typeof vi.fn>;
  switchSession: ReturnType<typeof vi.fn>;
} {
  const directory = mkdtempSync(join(tmpdir(), "pi-session-slice-command-"));

  temporaryDirectories.push(directory);

  const sessionDir = overrides.sessionDirMissing
    ? join(directory, "missing")
    : directory;
  const notify = vi.fn();
  const setEditorText = vi.fn();
  const newNotify = vi.fn();
  const newCtx: ReplacedSessionContext = {
    ...createFakeContext({ ui: { notify: newNotify, setEditorText } }),
    sendMessage: () => Promise.resolve(),
    sendUserMessage: () => Promise.resolve(),
  };
  let stale = false;
  const switchSession = vi.fn(
    async (
      _path: string,
      options?: {
        withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
      },
    ) => {
      await options?.withSession?.(newCtx);
      // Pi invalidates the original ctx once the old session is disposed.
      stale = true;

      return { cancelled: false };
    },
  );
  const header = "header" in overrides ? overrides.header : {};
  const ctx = createFakeContext({
    isIdle: () => overrides.idle ?? true,
    mode: overrides.mode ?? "tui",
    sessionManager: {
      getSessionFile: () =>
        "sessionFile" in overrides ? overrides.sessionFile : SOURCE_PATH,
      getHeader: () => (header ? { ...SOURCE_HEADER, ...header } : null),
      buildContextEntries: () => overrides.contextEntries ?? CANDIDATE_ENTRIES,
      getBranch: () => overrides.contextEntries ?? CANDIDATE_ENTRIES,
      getSessionDir: () => sessionDir,
      getCwd: () => "/project",
    },
    switchSession,
    ui: {
      ...(overrides.custom && { custom: overrides.custom }),
      notify: (message, type) => {
        if (stale) throw new Error("This extension ctx is stale");

        notify(message, type);
      },
    },
  });

  return { ctx, newNotify, notify, sessionDir, setEditorText, switchSession };
}

/** The header and entries of the session file at `path`. */
function readSession(path: string): {
  entries: SessionEntry[];
  header: SessionHeader;
} {
  const [header, ...entries] = readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as SessionEntry | SessionHeader);

  return {
    entries: entries as SessionEntry[],
    header: header as SessionHeader,
  };
}

function registeredCommand(): FakeCommand {
  const fake = createFakePi();

  sessionSlice(fake.pi);

  return fake.command("slice");
}

beforeEach(() => {
  mocks.showStartPicker.mockReset();
  mocks.showEndPicker.mockReset();
  mocks.showStartPicker.mockResolvedValue({
    candidate: START_CANDIDATE,
    kind: "message",
  });

  mocks.showEndPicker.mockResolvedValue({
    candidate: END_CANDIDATE,
    kind: "message",
  });
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("sessionSlice", () => {
  it("registers the slice command", () => {
    const fake = createFakePi();

    sessionSlice(fake.pi);

    expect([...fake.commands.keys()]).toEqual(["slice"]);
    expect(fake.command("slice").description).toBe(
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
    const { ctx, notify, sessionDir } = makeContext(overrides);

    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith(message, "warning");
    expect(mocks.showStartPicker).not.toHaveBeenCalled();
    expect(readdirSync(sessionDir)).toEqual([]);
  });

  it.each(["rpc", "json", "print"] as const)(
    "warns instead of opening the picker in %s mode",
    async (mode) => {
      const command = registeredCommand();
      const { ctx, notify, sessionDir } = makeContext({ mode });

      await command.handler("", ctx);

      expect(notify).toHaveBeenCalledExactlyOnceWith(
        "Session Slice: 1 warning\n- /slice needs Pi's interactive terminal UI. Run it from the TUI.",
        "warning",
      );
      expect(mocks.showStartPicker).not.toHaveBeenCalled();
      expect(readdirSync(sessionDir)).toEqual([]);
    },
  );

  it("refuses a context with no user messages", async () => {
    const command = registeredCommand();
    const { ctx, notify, sessionDir } = makeContext({ contextEntries: [] });

    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      "Session Slice: 1 warning\n- This session has no user messages yet, so there is nothing to slice.",
      "warning",
    );
    expect(mocks.showStartPicker).not.toHaveBeenCalled();
    expect(readdirSync(sessionDir)).toEqual([]);
  });

  it("cancels before writing from either picker", async () => {
    const command = registeredCommand();
    const first = makeContext();

    mocks.showStartPicker.mockResolvedValueOnce({ kind: "cancel" });
    await command.handler("", first.ctx);

    const second = makeContext();

    mocks.showEndPicker.mockResolvedValueOnce({ kind: "cancel" });
    await command.handler("", second.ctx);

    expect(readdirSync(first.sessionDir)).toEqual([]);
    expect(readdirSync(second.sessionDir)).toEqual([]);
    expect(first.switchSession).not.toHaveBeenCalled();
    expect(second.switchSession).not.toHaveBeenCalled();
  });

  it("writes, switches, pre-fills the end message, and reports success", async () => {
    const command = registeredCommand();
    const { ctx, newNotify, notify, sessionDir, setEditorText, switchSession } =
      makeContext();

    await command.handler("", ctx);

    expect(switchSession).toHaveBeenCalledTimes(1);

    const path = String(switchSession.mock.calls[0]?.[0]);
    const { entries, header } = readSession(path);
    const [model, start] = entries;

    expect(dirname(path)).toBe(sessionDir);
    expect(readdirSync(sessionDir)).toHaveLength(1);
    expect(header).toMatchObject({
      cwd: "/project",
      parentSession: SOURCE_PATH,
      type: "session",
      version: 3,
    });

    expect(model).toMatchObject({
      type: "model_change",
      parentId: null,
      provider: "anthropic",
      modelId: "claude-test",
    });
    expect(start).toEqual({ ...CANDIDATE_ENTRIES[1], parentId: model?.id });
    expect(entries).toHaveLength(2);
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
    const { ctx, newNotify, setEditorText, switchSession } = makeContext();

    mocks.showEndPicker.mockResolvedValueOnce({ kind: "end" });
    await command.handler("", ctx);

    const { entries } = readSession(String(switchSession.mock.calls[0]?.[0]));

    expect(entries.map((entry) => entry.id).slice(1)).toEqual(["u1", "u2"]);
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
      const { ctx, notify, sessionDir } = makeContext();

      await command.handler(args, ctx);

      expect(notify).toHaveBeenCalledExactlyOnceWith(
        `Session Slice: 1 warning\n- Unknown subcommand "${args.trim()}". Try /slice.`,
        "warning",
      );
      expect(mocks.showStartPicker).not.toHaveBeenCalled();
      expect(readdirSync(sessionDir)).toEqual([]);
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
    const { ctx, notify, sessionDir, switchSession } = makeContext({
      sessionDirMissing: true,
    });

    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        /^Could not create the sliced session: ENOENT: no such file or directory, open '.+\.jsonl'\.$/u,
      ),
      "error",
    );
    expect(String(notify.mock.calls[0]?.[0])).toContain(sessionDir);
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

    const path = String(switchSession.mock.calls[0]?.[0]);

    expect(readSession(path).header.parentSession).toBe(SOURCE_PATH);
    expect(notify).toHaveBeenCalledWith(
      `Session Slice: 1 warning\n- The sliced session was saved at ${path}, but Pi did not switch to it.`,
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

    await run("", { sessionDirMissing: true });

    await run("", {}, true);

    mocks.showStartPicker.mockRejectedValueOnce(new Error("overlay closed"));
    await run("");

    for (const line of rendered) shown.record("text", line.trim());

    expect(shown.texts).toContainEqual({
      surface: "text",
      text: "Slice: Start at Message",
    });

    expect(shown.texts).toContainEqual({
      surface: "text",
      text: "Slice: End Before Message",
    });

    expect(shown.texts).toContainEqual({
      surface: "text",
      text: "↑/↓ Move · PgUp/PgDn Page · Enter Select · Esc Cancel",
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
