/**
 * `mise run changeset-check`: fail when a pending changeset would make
 * `mise run version` fail, so a bad group prefix, package name or bump shows
 * up in `mise run check` instead of at release time.
 *
 * Node runs this file directly, which is why its imports end in `.ts`.
 */

import { checkChangesets } from "./version.ts";

try {
  const count = await checkChangesets(process.cwd());

  process.stdout.write(`${count} pending changesets are valid.\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
