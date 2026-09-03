/**
 * Durable notification history backed by Pi session entries.
 *
 * Owns building the versioned entry payload and extracting validated
 * notification entries from an active session branch. It does NOT own
 * formatting, presentation, or the decision of when to persist — callers
 * pass the branch in and receive plain data back.
 *
 * Pi session entries are the single source of truth: the branch is
 * re-read on every request so resumed sessions, reloads, and branch
 * navigation are reflected without any cache-invalidation logic.
 */

import {
  CUSTOM_ENTRY_TYPE,
  ENTRY_VERSION,
  isNotificationSeverity,
  type NotificationEntry,
  type NotificationSeverity,
} from "./types.js";

/**
 * Structural shape of the session entries this module inspects.
 *
 * Declared locally rather than imported so tests can build tiny fakes and
 * so a Pi entry-union change cannot break compilation of the read path.
 */
export interface BranchEntry {
  customType?: string;
  data?: unknown;
  type: string;
}

/** Build the payload persisted for one captured notification. */
export function createNotificationEntry(
  message: string,
  severity: NotificationSeverity,
  timestamp: number = Date.now(),
): NotificationEntry {
  return { message, severity, timestamp, version: ENTRY_VERSION };
}

/**
 * Extract every valid notification entry from a session branch.
 *
 * Results are returned in branch (oldest-first) order; presentation code
 * decides display order. Entries written by another extension, entries
 * with an unrecognized `version`, and structurally invalid payloads are
 * skipped rather than rendered as partial records.
 */
export function readNotificationHistory(
  branch: readonly BranchEntry[],
): NotificationEntry[] {
  const entries: NotificationEntry[] = [];

  for (const entry of branch) {
    if (entry.type !== "custom" || entry.customType !== CUSTOM_ENTRY_TYPE) {
      continue;
    }

    const parsed = parseEntryData(entry.data);

    if (parsed) entries.push(parsed);
  }

  return entries;
}

function parseEntryData(data: unknown): NotificationEntry | undefined {
  if (typeof data !== "object" || data === null) return undefined;

  const record = data as Record<string, unknown>;

  if (record.version !== ENTRY_VERSION) return undefined;

  const { message, severity, timestamp } = record;

  if (typeof message !== "string") return undefined;

  if (!isNotificationSeverity(severity)) return undefined;

  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return undefined;
  }

  return { message, severity, timestamp, version: ENTRY_VERSION };
}
