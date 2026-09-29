/** Slices an exact range of a Pi session branch into a new session file. */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { uuidv7 } from "@earendil-works/pi-ai";
import type {
  ExtensionContext,
  ModelChangeEntry,
  SessionEntry,
  SessionHeader,
  SessionMessageEntry,
  ThinkingLevelChangeEntry,
} from "@earendil-works/pi-coding-agent";

type LabelEntry = Extract<SessionEntry, { type: "label" }>;
type ReadonlySessionManager = ExtensionContext["sessionManager"];

/** Session file format understood by this extension. */
const SUPPORTED_SESSION_VERSION = 3;

/** The user-message ids that bound a slice; without `endId` it keeps to the end. */
export interface SliceBoundaries {
  endId?: string | undefined;
  startId: string;
}

/** A user-message boundary shown by the picker. */
export interface SliceCandidate {
  id: string;
  ordinal: number;
  text: string;
  timestamp: string;
  total: number;
}

/** File-system operation used to persist a completed slice. */
export interface SliceFileSystem {
  writeFileSync: typeof writeFileSync;
}

/**
 * The written session's path and the number of source entries copied into it,
 * or the reason nothing was written.
 */
export type SliceSessionResult =
  { copied: number; path: string } | { reason: string };

type BuildSliceResult =
  { copied: number; entries: SessionEntry[] } | { reason: string };

const DEFAULT_FILE_SYSTEM: SliceFileSystem = { writeFileSync };

/** Build picker candidates from Pi's compaction-aware context view. */
export function listCandidates(
  sessionManager: Pick<ReadonlySessionManager, "buildContextEntries">,
): SliceCandidate[] {
  const messages = sessionManager
    .buildContextEntries()
    .filter(isUserMessageEntry);
  const total = messages.length;

  return messages.map((entry, index) => ({
    id: entry.id,
    ordinal: index + 1,
    text: extractUserMessageText(entry.message.content),
    timestamp: entry.timestamp,
    total,
  }));
}

/**
 * Write the branch range between `boundaries` to one new session file in the
 * session directory. Throws when the write fails or the session has no file.
 */
export function sliceSession(
  sessionManager: Pick<
    ReadonlySessionManager,
    "getBranch" | "getCwd" | "getSessionDir" | "getSessionFile"
  >,
  boundaries: SliceBoundaries,
  fs: SliceFileSystem = DEFAULT_FILE_SYSTEM,
): SliceSessionResult {
  const sourcePath = sessionManager.getSessionFile();

  if (!sourcePath) throw new Error("The session has no session file.");

  const now = new Date();
  const result = buildSlice(
    sessionManager.getBranch(),
    boundaries.startId,
    boundaries.endId,
    now,
  );

  if ("reason" in result) return result;

  const path = writeSliceFile(
    sessionManager.getSessionDir(),
    sessionManager.getCwd(),
    sourcePath,
    result.entries,
    now,
    fs,
  );

  return { copied: result.copied, path };
}

/** Why this extension cannot slice the session, or `undefined` when it can. */
export function unsupportedSourceReason(
  sessionManager: Pick<ReadonlySessionManager, "getHeader">,
): string | undefined {
  const version = sessionManager.getHeader()?.version;

  if (version === SUPPORTED_SESSION_VERSION) return undefined;

  return `This session uses unsupported format version ${String(version ?? "unknown")}.`;
}

function buildLabelEntries(
  branch: readonly SessionEntry[],
  copiedEntries: readonly SessionEntry[],
  ids: Set<string>,
): LabelEntry[] {
  const labels = new Map<string, { label: string; timestamp: string }>();

  for (const entry of branch) {
    if (entry.type !== "label") continue;

    if (entry.label) {
      labels.set(entry.targetId, {
        label: entry.label,
        timestamp: entry.timestamp,
      });
    } else {
      labels.delete(entry.targetId);
    }
  }

  const copiedIds = new Set(copiedEntries.map((entry) => entry.id));
  const output: LabelEntry[] = [];
  let parentId = copiedEntries.at(-1)?.id ?? null;

  for (const [targetId, value] of labels) {
    if (!copiedIds.has(targetId)) continue;

    const id = nextEntryId(ids);
    const entry: LabelEntry = {
      type: "label",
      id,
      parentId,
      timestamp: value.timestamp,
      targetId,
      label: value.label,
    };

    output.push(entry);
    parentId = id;
  }

  return output;
}

function buildSlice(
  branch: readonly SessionEntry[],
  startId: string,
  endId: string | undefined,
  now: Date,
): BuildSliceResult {
  const startIndex = branch.findIndex((entry) => entry.id === startId);

  if (startIndex < 0)
    return { reason: "The start message is no longer available." };

  const endIndex =
    endId === undefined
      ? branch.length
      : branch.findIndex((entry) => entry.id === endId);

  if (endIndex < 0)
    return { reason: "The end message is no longer available." };

  if (endIndex <= startIndex) {
    return { reason: "The end message must come after the start message." };
  }

  if (!isUserMessageEntry(branch[startIndex])) {
    return { reason: "The start boundary must be a user message." };
  }

  if (endId !== undefined && !isUserMessageEntry(branch[endIndex])) {
    return { reason: "The end boundary must be a user message." };
  }

  const ids = new Set(branch.map((entry) => entry.id));
  const timestamp = now.toISOString();
  const syntheticEntries = buildStateEntries(
    branch.slice(0, startIndex),
    ids,
    timestamp,
  );
  const copiedEntries = copyRange(
    branch.slice(startIndex, endIndex),
    syntheticEntries.at(-1)?.id ?? null,
  );

  if (copiedEntries.length === 0) {
    return { reason: "The selected range contains no session entries." };
  }

  const labels = buildLabelEntries(branch, copiedEntries, ids);

  return {
    copied: copiedEntries.length,
    entries: [...syntheticEntries, ...copiedEntries, ...labels],
  };
}

function buildStateEntries(
  prefix: readonly SessionEntry[],
  ids: Set<string>,
  timestamp: string,
): (ModelChangeEntry | ThinkingLevelChangeEntry)[] {
  let model: ModelChangeEntry | undefined;
  let thinking: ThinkingLevelChangeEntry | undefined;

  for (const entry of prefix) {
    if (entry.type === "model_change") model = entry;
    if (entry.type === "thinking_level_change") thinking = entry;
  }

  const entries: (ModelChangeEntry | ThinkingLevelChangeEntry)[] = [];
  let parentId: string | null = null;

  if (model) {
    const id = nextEntryId(ids);

    entries.push({
      type: "model_change",
      id,
      parentId,
      timestamp,
      provider: model.provider,
      modelId: model.modelId,
    });
    parentId = id;
  }

  if (thinking) {
    const id = nextEntryId(ids);

    entries.push({
      type: "thinking_level_change",
      id,
      parentId,
      timestamp,
      thinkingLevel: thinking.thinkingLevel,
    });
  }

  return entries;
}

function copyRange(
  range: readonly SessionEntry[],
  initialParentId: string | null,
): SessionEntry[] {
  const output: SessionEntry[] = [];
  let parentId = initialParentId;

  for (const entry of range) {
    if (
      entry.type === "label" ||
      entry.type === "compaction" ||
      entry.type === "session_info"
    ) {
      continue;
    }

    const copy = entry.parentId === parentId ? entry : { ...entry, parentId };

    output.push(copy);
    parentId = copy.id;
  }

  return output;
}

function extractUserMessageText(
  content: string | readonly { type: string; text?: string }[],
): string {
  if (typeof content === "string") return content;

  return content
    .filter(
      (part): part is { type: string; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
}

function generateEntryId(ids: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = randomUUID().slice(0, 8);

    if (!ids.has(id)) return id;
  }

  return randomUUID();
}

function isUserMessageEntry(
  entry: SessionEntry | undefined,
): entry is SessionMessageEntry & {
  message: Extract<SessionMessageEntry["message"], { role: "user" }>;
} {
  return entry?.type === "message" && entry.message.role === "user";
}

function nextEntryId(ids: Set<string>): string {
  const id = generateEntryId(ids);

  ids.add(id);

  return id;
}

function writeSliceFile(
  sessionDir: string,
  cwd: string,
  sourcePath: string,
  entries: readonly SessionEntry[],
  now: Date,
  fs: SliceFileSystem,
): string {
  const timestamp = now.toISOString();
  const sessionId = uuidv7();
  const fileTimestamp = timestamp.replaceAll(/[:.]/g, "-");
  const destination = join(sessionDir, `${fileTimestamp}_${sessionId}.jsonl`);
  const header: SessionHeader = {
    type: "session",
    version: SUPPORTED_SESSION_VERSION,
    id: sessionId,
    timestamp,
    cwd,
    parentSession: sourcePath,
  };
  const contents = [header, ...entries]
    .map((entry) => JSON.stringify(entry))
    .join("\n");

  fs.writeFileSync(destination, `${contents}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  return destination;
}
