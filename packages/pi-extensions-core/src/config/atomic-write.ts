/**
 * Writes a file durably by creating the parent directory, filling a
 * temporary file, syncing it, and renaming it over the destination, so no
 * reader sees a half-written file.
 */
import type { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * The `node:fs/promises` calls this module makes. Core's tests inject a
 * stub to simulate rename failures, which vitest cannot spy on because
 * Node's native modules export frozen ESM bindings.
 */
export interface AtomicWriteFs {
  mkdir: typeof mkdir;
  open: typeof open;
  rename: typeof rename;
  unlink: typeof unlink;
}

/**
 * Atomically write `contents` to `target`.
 *
 * Throws on I/O failure, leaving the destination untouched. A caller that
 * wants stricter ordering than last write wins has to serialize its own
 * concurrent writes.
 */
export async function atomicWrite(
  target: string,
  contents: string,
  fs: AtomicWriteFs,
): Promise<void> {
  const dir = dirname(target);

  await fs.mkdir(dir, { recursive: true });

  const temporaryFilePath = makeTmpPath(target);
  let renamed = false;
  const fileHandle = await fs.open(temporaryFilePath, "w");

  try {
    try {
      await fileHandle.writeFile(contents);
      await fileHandle.sync();
    } finally {
      await fileHandle.close();
    }

    await fs.rename(temporaryFilePath, target);
    renamed = true;
  } finally {
    if (!renamed) {
      // Best effort: don't mask the original error if cleanup fails.
      await fs.unlink(temporaryFilePath).catch(() => undefined);
    }
  }
}

/**
 * Atomically write `value` to `path` as JSON indented by two spaces and
 * ending in a newline.
 *
 * Throws on I/O failure, leaving the destination untouched, as
 * `atomicWrite` does.
 */
export async function writeJsonFile(
  path: string,
  value: unknown,
  fs: AtomicWriteFs,
): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`, fs);
}

/**
 * Build a temporary file path next to `target` so the later rename stays
 * on one filesystem and therefore stays atomic.
 *
 * The process id and the monotonic `process.hrtime.bigint()` reading keep
 * concurrent writers from picking the same path.
 */
function makeTmpPath(target: string): string {
  return `${target}.tmp.${process.pid}.${process.hrtime.bigint().toString(36)}`;
}
