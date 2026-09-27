/** Sends terminal queries and waits for matching replies. */

import type {
  ExtensionContext,
  TerminalInputHandler,
} from "@earendil-works/pi-coding-agent";

/** Default time to wait for a terminal query response. */
export const DEFAULT_TERMINAL_QUERY_TIMEOUT_MS = 300;

/** Sends a terminal sequence and resolves with the first parsed response. */
export async function queryWithTerminalListener<T>(
  ctx: ExtensionContext,
  sequence: string,
  parse: (data: string) => T | undefined,
  timeoutMs = DEFAULT_TERMINAL_QUERY_TIMEOUT_MS,
): Promise<T | undefined> {
  // Writing control sequences to stdout would corrupt RPC output.
  if (ctx.mode !== "tui") {
    return undefined;
  }

  return new Promise<T | undefined>((resolve) => {
    let settled = false;

    const finish = (result: T | undefined) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutHandle);
      unsubscribe();
      resolve(result);
    };

    const handler: TerminalInputHandler = (data) => {
      const result = parse(data);

      if (result !== undefined) {
        finish(result);

        return { consume: true };
      }

      return undefined;
    };

    const unsubscribe = ctx.ui.onTerminalInput(handler);

    const timeoutHandle = setTimeout(() => {
      finish(undefined);
    }, timeoutMs);

    process.stdout.write(sequence);
  });
}
