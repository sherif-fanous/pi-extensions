/**
 * Builds the versioned entry payload for one notification and extracts
 * validated entries back out of a session branch.
 *
 * Pi session entries are the only store. Callers pass a branch in and
 * receive plain data back, so nothing here is cached.
 */

import {
  CUSTOM_ENTRY_TYPE,
  ENTRY_VERSION,
  isNotificationSeverity,
  type NotificationEntry,
  type NotificationSeverity,
} from "./types.js";

/**
 * Shape of the session entries this module inspects.
 *
 * Declared locally rather than imported from Pi so tests can build small
 * fakes and a change to Pi's entry union cannot break the read path.
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
 * Results keep branch order, which is oldest first. Entries from another
 * extension, entries with an unrecognized `version`, and malformed
 * payloads are skipped rather than returned as partial records.
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
