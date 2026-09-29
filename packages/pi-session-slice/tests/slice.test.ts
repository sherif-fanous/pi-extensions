/** Covers candidate projection, source checks, exact range copying, state, labels, and JSONL output. */

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  listCandidates,
  sliceSession,
  unsupportedSourceReason,
  type SliceBoundaries,
  type SliceFileSystem,
} from "../src/slice.js";
import {
  buildContextEntries,
  SessionManager,
  type SessionEntry,
  type SessionHeader,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

const SOURCE_PATH = "/sessions/source.jsonl";
const TIMESTAMP = "2026-03-10T12:00:00.000Z";
const temporaryDirectories: string[] = [];

/** A session file written by `sliceSession`, read back from disk. */
interface WrittenSlice {
  copied: number;
  entries: SessionEntry[];
  header: SessionHeader;
  lines: string[];
  path: string;
}

function assistant(id: string, parentId: string, text: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: TIMESTAMP,
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-test",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.parse(TIMESTAMP),
    },
  };
}

function customMessage(id: string, parentId: string): SessionEntry {
  return {
    type: "custom_message",
    id,
    parentId,
    timestamp: TIMESTAMP,
    customType: "test",
    content: "custom context",
    display: true,
  };
}

function entryAt(
  entries: readonly SessionEntry[],
  index: number,
): SessionEntry {
  const entry = entries[index];

  if (!entry) throw new Error(`Missing fixture entry at index ${index}.`);

  return entry;
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-session-slice-"));

  temporaryDirectories.push(directory);

  return directory;
}

function messageAt(entries: readonly SessionEntry[], index: number) {
  const entry = entryAt(entries, index);

  if (entry.type !== "message") {
    throw new Error(`Fixture entry at index ${index} is not a message.`);
  }

  return entry.message;
}

function model(id: string, parentId: string | null): SessionEntry {
  return {
    type: "model_change",
    id,
    parentId,
    timestamp: TIMESTAMP,
    provider: "anthropic",
    modelId: "claude-test",
  };
}

/** Slice `branch` into a new temporary directory and read the file back. */
async function sliceBranch(
  branch: readonly SessionEntry[],
  boundaries: SliceBoundaries,
): Promise<WrittenSlice> {
  const directory = await makeTemporaryDirectory();
  const result = sliceSession(sourceSession(branch, directory), boundaries);

  if ("reason" in result) throw new Error(result.reason);

  const lines = (await readFile(result.path, "utf8")).trimEnd().split("\n");
  const [header, ...entries] = lines.map(
    (line) => JSON.parse(line) as SessionEntry | SessionHeader,
  );

  return {
    copied: result.copied,
    entries: entries as SessionEntry[],
    header: header as SessionHeader,
    lines,
    path: result.path,
  };
}

/** A source session manager whose current branch is `branch`. */
function sourceSession(
  branch: readonly SessionEntry[],
  sessionDir: string,
  sourcePath: string = SOURCE_PATH,
): Parameters<typeof sliceSession>[0] {
  return {
    getBranch: () => [...branch],
    getCwd: () => "/project",
    getSessionDir: () => sessionDir,
    getSessionFile: () => sourcePath,
  };
}

function thinking(id: string, parentId: string): SessionEntry {
  return {
    type: "thinking_level_change",
    id,
    parentId,
    timestamp: TIMESTAMP,
    thinkingLevel: "high",
  };
}

function toolCall(id: string, parentId: string): SessionEntry {
  const entry = assistant(id, parentId, "");

  if (entry.type === "message" && entry.message.role === "assistant") {
    entry.message.content = [
      { type: "toolCall", id: "call-1", name: "read", arguments: {} },
    ];
    entry.message.stopReason = "toolUse";
  }

  return entry;
}

function toolResult(id: string, parentId: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: TIMESTAMP,
    message: {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text: "file" }],
      isError: false,
      timestamp: Date.parse(TIMESTAMP),
    },
  };
}

function user(id: string, parentId: string | null, text: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: TIMESTAMP,
    message: {
      role: "user",
      content: text,
      timestamp: Date.parse(TIMESTAMP),
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("listCandidates", () => {
  it("returns only user messages in context order", () => {
    const contextEntries = [
      user("u1", null, "first"),
      model("m1", "u1"),
      assistant("a1", "m1", "reply"),
      customMessage("c1", "a1"),
      user("u2", "c1", "second"),
    ];

    expect(
      listCandidates({ buildContextEntries: () => contextEntries }),
    ).toEqual([
      {
        id: "u1",
        ordinal: 1,
        text: "first",
        timestamp: TIMESTAMP,
        total: 2,
      },
      {
        id: "u2",
        ordinal: 2,
        text: "second",
        timestamp: TIMESTAMP,
        total: 2,
      },
    ]);
  });

  it("excludes tool-result and bash-execution messages", () => {
    const contextEntries: SessionEntry[] = [
      user("u1", null, "keep"),
      toolResult("tool-result", "u1"),
      {
        type: "message",
        id: "bash",
        parentId: "tool-result",
        timestamp: TIMESTAMP,
        message: {
          role: "bashExecution",
          command: "pwd",
          output: "/project",
          exitCode: 0,
          cancelled: false,
          truncated: false,
          timestamp: Date.parse(TIMESTAMP),
        },
      },
    ];

    expect(
      listCandidates({ buildContextEntries: () => contextEntries }),
    ).toEqual([expect.objectContaining({ id: "u1", ordinal: 1, total: 1 })]);
  });

  it("includes retained messages and excludes compaction-hidden messages", () => {
    const branch: SessionEntry[] = [
      user("u1", null, "hidden"),
      assistant("a1", "u1", "hidden reply"),
      user("u2", "a1", "retained"),
      assistant("a2", "u2", "retained reply"),
      {
        type: "compaction",
        id: "compact",
        parentId: "a2",
        timestamp: TIMESTAMP,
        summary: "summary",
        firstKeptEntryId: "u2",
        tokensBefore: 10,
      },
      user("u3", "compact", "after"),
    ];
    const context = buildContextEntries(branch);

    expect(listCandidates({ buildContextEntries: () => context })).toEqual([
      expect.objectContaining({ id: "u2", ordinal: 1, text: "retained" }),
      expect.objectContaining({ id: "u3", ordinal: 2, text: "after" }),
    ]);
  });
});

describe("unsupportedSourceReason", () => {
  it("accepts a version 3 session and names any other version", () => {
    const reasonFor = (version: number | undefined): string | undefined =>
      unsupportedSourceReason({
        getHeader: () => ({
          type: "session",
          id: "source",
          timestamp: TIMESTAMP,
          cwd: "/project",
          version,
        }),
      });

    expect(reasonFor(3)).toBeUndefined();
    expect(reasonFor(2)).toBe(
      "This session uses unsupported format version 2.",
    );

    expect(reasonFor(undefined)).toBe(
      "This session uses unsupported format version unknown.",
    );

    expect(unsupportedSourceReason({ getHeader: () => null })).toBe(
      "This session uses unsupported format version unknown.",
    );
  });
});

describe("sliceSession", () => {
  it("copies tool and custom entries without changing their data", async () => {
    const branch = [
      user("u1", null, "drop"),
      user("u2", "u1", "keep"),
      toolCall("a2", "u2"),
      toolResult("t2", "a2"),
      customMessage("c2", "t2"),
      user("u3", "c2", "editor"),
    ];
    const slice = await sliceBranch(branch, { startId: "u2", endId: "u3" });

    expect(slice.copied).toBe(4);
    expect(slice.entries).toEqual([
      { ...entryAt(branch, 1), parentId: null },
      entryAt(branch, 2),
      entryAt(branch, 3),
      entryAt(branch, 4),
    ]);

    expect(slice.lines.slice(2)).toEqual(
      [2, 3, 4].map((index) => JSON.stringify(entryAt(branch, index))),
    );

    expect(slice.entries[2]).toMatchObject({
      id: "t2",
      message: { toolCallId: "call-1" },
      timestamp: TIMESTAMP,
    });
  });

  it("preserves custom, bash, and branch-summary entries", async () => {
    const branch: SessionEntry[] = [
      user("u1", null, "keep"),
      {
        type: "custom",
        id: "custom",
        parentId: "u1",
        timestamp: TIMESTAMP,
        customType: "state",
        data: { enabled: true },
      },
      {
        type: "message",
        id: "bash",
        parentId: "custom",
        timestamp: TIMESTAMP,
        message: {
          role: "bashExecution",
          command: "pwd",
          output: "/project",
          exitCode: 0,
          cancelled: false,
          truncated: false,
          timestamp: Date.parse(TIMESTAMP),
        },
      },
      {
        type: "branch_summary",
        id: "summary",
        parentId: "bash",
        timestamp: TIMESTAMP,
        fromId: "old-leaf",
        summary: "Earlier branch",
      },
      assistant("a1", "summary", "reply"),
    ];
    const slice = await sliceBranch(branch, { startId: "u1" });

    expect(slice.copied).toBe(5);
    expect(slice.lines.slice(1)).toEqual(
      branch.map((entry) => JSON.stringify(entry)),
    );
  });

  it("strips a compaction after a retained start and re-chains around it", async () => {
    const branch: SessionEntry[] = [
      user("u1", null, "old"),
      assistant("a1", "u1", "old reply"),
      user("u2", "a1", "retained"),
      assistant("a2", "u2", "retained reply"),
      {
        type: "compaction",
        id: "compact",
        parentId: "a2",
        timestamp: TIMESTAMP,
        summary: "summary",
        firstKeptEntryId: "u2",
        tokensBefore: 10,
      },
      user("u3", "compact", "after"),
      assistant("a3", "u3", "after reply"),
    ];
    const fromRetained = await sliceBranch(branch, { startId: "u2" });
    const fromAfter = await sliceBranch(branch, { startId: "u3" });

    expect(fromRetained.copied).toBe(4);
    expect(fromRetained.entries).toEqual([
      { ...entryAt(branch, 2), parentId: null },
      entryAt(branch, 3),
      { ...entryAt(branch, 5), parentId: "a2" },
      entryAt(branch, 6),
    ]);

    expect(fromAfter.copied).toBe(2);
    expect(fromAfter.entries).toEqual([
      { ...entryAt(branch, 5), parentId: null },
      entryAt(branch, 6),
    ]);
  });

  it("round-trips a pre-compaction start without restoring the compaction", async () => {
    const branch: SessionEntry[] = [
      user("u1", null, "hidden"),
      assistant("a1", "u1", "hidden reply"),
      user("u2", "a1", "retained"),
      assistant("a2", "u2", "retained reply"),
      {
        type: "compaction",
        id: "compact",
        parentId: "a2",
        timestamp: TIMESTAMP,
        summary: "summary",
        firstKeptEntryId: "u2",
        tokensBefore: 10,
      },
      user("u3", "compact", "after"),
      assistant("a3", "u3", "after reply"),
    ];
    const slice = await sliceBranch(branch, { startId: "u2" });
    const loaded = SessionManager.open(slice.path);

    expect(loaded.getEntries()).toEqual(slice.entries);
    expect(
      loaded.getEntries().some((entry) => entry.type === "compaction"),
    ).toBe(false);

    expect(loaded.buildSessionContext().messages).toEqual([
      messageAt(branch, 2),
      messageAt(branch, 3),
      messageAt(branch, 5),
      messageAt(branch, 6),
    ]);
  });

  it("carries the effective model and thinking level but not the name", async () => {
    const branch: SessionEntry[] = [
      model("m1", null),
      thinking("t1", "m1"),
      {
        type: "session_info",
        id: "name",
        parentId: "t1",
        timestamp: TIMESTAMP,
        name: "Source name",
      },
      user("u1", "name", "keep"),
      assistant("a1", "u1", "reply"),
    ];
    const slice = await sliceBranch(branch, { startId: "u1" });
    const [newModel, newThinking, ...copied] = slice.entries;
    const sourceIds = branch.map((entry) => entry.id);

    expect(slice.copied).toBe(2);
    expect(newModel).toEqual({
      ...entryAt(branch, 0),
      id: newModel?.id,
      parentId: null,
      timestamp: slice.header.timestamp,
    });

    expect(newThinking).toEqual({
      ...entryAt(branch, 1),
      id: newThinking?.id,
      parentId: newModel?.id,
      timestamp: slice.header.timestamp,
    });
    expect(newModel?.id).toMatch(/^[\da-f]{8}$/u);
    expect(sourceIds).not.toContain(newModel?.id);
    expect(sourceIds).not.toContain(newThinking?.id);
    expect(newModel?.id).not.toBe(newThinking?.id);
    expect(copied).toEqual([
      { ...entryAt(branch, 3), parentId: newThinking?.id },
      entryAt(branch, 4),
    ]);

    expect(slice.entries.some((entry) => entry.type === "session_info")).toBe(
      false,
    );
  });

  it("carries the latest model and thinking changes before the start", async () => {
    const branch: SessionEntry[] = [
      model("model-old", null),
      thinking("thinking-old", "model-old"),
      {
        type: "model_change",
        id: "model-latest",
        parentId: "thinking-old",
        timestamp: TIMESTAMP,
        provider: "openai",
        modelId: "gpt-latest",
      },
      {
        type: "thinking_level_change",
        id: "thinking-latest",
        parentId: "model-latest",
        timestamp: TIMESTAMP,
        thinkingLevel: "xhigh",
      },
      user("u1", "thinking-latest", "keep"),
      assistant("a1", "u1", "reply"),
    ];
    const slice = await sliceBranch(branch, { startId: "u1" });

    expect(slice.copied).toBe(2);
    expect(slice.entries[0]).toMatchObject({
      provider: "openai",
      modelId: "gpt-latest",
    });
    expect(slice.entries[1]).toMatchObject({ thinkingLevel: "xhigh" });
  });

  it("adds no synthetic state when the prefix has none", async () => {
    const branch = [user("u1", null, "keep"), assistant("a1", "u1", "reply")];
    const slice = await sliceBranch(branch, { startId: "u1" });

    expect(slice.copied).toBe(2);
    expect(slice.entries).toEqual(branch);
  });

  it("strips a source rename inside the selected range", async () => {
    const branch: SessionEntry[] = [
      user("u1", null, "keep"),
      {
        type: "session_info",
        id: "name",
        parentId: "u1",
        timestamp: TIMESTAMP,
        name: "Source name",
      },
      assistant("a1", "name", "reply"),
    ];
    const slice = await sliceBranch(branch, { startId: "u1" });

    expect(slice.copied).toBe(2);
    expect(slice.entries).toEqual([
      entryAt(branch, 0),
      { ...entryAt(branch, 2), parentId: "u1" },
    ]);
  });

  it("writes a label that resolves on the new session", async () => {
    const branch: SessionEntry[] = [
      user("u1", null, "keep"),
      {
        type: "label",
        id: "label-old",
        parentId: "u1",
        timestamp: "2026-03-10T12:01:00.000Z",
        targetId: "u1",
        label: "old",
      },
      assistant("a1", "label-old", "reply"),
      {
        type: "label",
        id: "label-new",
        parentId: "a1",
        timestamp: "2026-03-10T12:02:00.000Z",
        targetId: "u1",
        label: "current",
      },
    ];
    const slice = await sliceBranch(branch, { startId: "u1" });

    expect(SessionManager.open(slice.path).getLabel("u1")).toBe("current");
  });

  it("returns reasons for missing and reversed boundaries without writing", async () => {
    const directory = await makeTemporaryDirectory();
    const session = sourceSession(
      [user("u1", null, "one"), user("u2", "u1", "two")],
      directory,
    );

    expect(sliceSession(session, { startId: "missing" })).toEqual({
      reason: "The start message is no longer available.",
    });

    expect(sliceSession(session, { startId: "u1", endId: "missing" })).toEqual({
      reason: "The end message is no longer available.",
    });

    expect(sliceSession(session, { startId: "u2", endId: "u1" })).toEqual({
      reason: "The end message must come after the start message.",
    });

    expect(await readdir(directory)).toEqual([]);
  });

  it("writes a loadable v3 session with lineage and restored model", async () => {
    const branch: SessionEntry[] = [
      model("model", null),
      user("u1", "model", "hello"),
      assistant("a1", "u1", "hi"),
    ];
    const slice = await sliceBranch(branch, { startId: "u1" });
    const loaded = SessionManager.open(slice.path);

    expect(slice.header).toEqual({
      type: "session",
      version: 3,
      id: slice.header.id,
      timestamp: slice.header.timestamp,
      cwd: "/project",
      parentSession: SOURCE_PATH,
    });

    expect(slice.header.id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[\da-f]{4}-[\da-f]{12}$/u,
    );

    expect(new Date(slice.header.timestamp).toISOString()).toBe(
      slice.header.timestamp,
    );

    expect(basename(slice.path)).toBe(
      `${slice.header.timestamp.replaceAll(/[:.]/g, "-")}_${slice.header.id}.jsonl`,
    );

    expect(await readFile(slice.path, "utf8")).toBe(
      `${slice.lines.join("\n")}\n`,
    );
    expect(slice.lines).toHaveLength(slice.entries.length + 1);
    expect(loaded.buildSessionContext()).toMatchObject({
      messages: [messageAt(branch, 1), messageAt(branch, 2)],
      model: { provider: "anthropic", modelId: "claude-test" },
    });
  });

  it("does not change the source after a successful write", async () => {
    const directory = await makeTemporaryDirectory();
    const source = join(directory, "source.jsonl");
    const sourceBytes = Buffer.from('{"source":true}\n');

    await writeFile(source, sourceBytes);

    const before = await readdir(directory);
    const result = sliceSession(
      sourceSession([user("u1", null, "hello")], directory, source),
      { startId: "u1" },
    );
    const after = await readdir(directory);

    if ("reason" in result) throw new Error(result.reason);

    expect(await readFile(source)).toEqual(sourceBytes);
    expect(before).toEqual(["source.jsonl"]);
    expect(after.filter((path) => join(directory, path) !== source)).toEqual([
      basename(result.path),
    ]);
  });

  it("calls the writer once with a destination distinct from the source", () => {
    const destinations: string[] = [];
    const recordingFs: SliceFileSystem = {
      writeFileSync: (path) => {
        destinations.push(String(path));
      },
    };
    const result = sliceSession(
      sourceSession([user("u1", null, "hello")], "/sessions"),
      { startId: "u1" },
      recordingFs,
    );

    if ("reason" in result) throw new Error(result.reason);

    expect(destinations).toEqual([result.path]);
    expect(result.path).not.toBe(SOURCE_PATH);
  });

  it("does not change the source when the destination write fails", async () => {
    const directory = await makeTemporaryDirectory();
    const source = join(directory, "source.jsonl");
    const sourceBytes = Buffer.from('{"source":true}\n');
    const failingFs: SliceFileSystem = {
      writeFileSync: () => {
        throw new Error("simulated write failure");
      },
    };

    await writeFile(source, sourceBytes);

    expect(() =>
      sliceSession(
        sourceSession([user("u1", null, "hello")], directory, source),
        { startId: "u1" },
        failingFs,
      ),
    ).toThrow("simulated write failure");
    expect(await readFile(source)).toEqual(sourceBytes);
  });
});
