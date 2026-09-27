/**
 * Scaffolding for extension entry points: error guards for command and
 * event handlers, and argument completion for fixed subcommands.
 */

import { describeError } from "./errors.js";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

/** The part of a handler's context the guards use to report a failure. */
export interface GuardContext {
  readonly ui: Pick<ExtensionUIContext, "notify">;
}

/** One fixed subcommand offered by {@link subcommandCompletions}. */
export interface SubcommandCompletion {
  /** Short text shown after the name in the completion label. */
  readonly description?: string;
  /** Token the user types, and the value the completion inserts. */
  readonly name: string;
}

/**
 * Wrap a command handler so a failure becomes an error notification.
 *
 * When `handler` throws or rejects, the wrapper notifies
 * `<extensionName> command failed: <message>` at error severity and
 * resolves, so Pi never shows its generic extension error row. The
 * handler's error is never rethrown.
 *
 * `C` is inferred as `ExtensionCommandContext` when the wrapper is passed
 * to `pi.registerCommand`; tests may call it with a narrower context.
 */
export function guardCommand<C extends GuardContext>(
  extensionName: string,
  handler: (args: string, ctx: C) => Promise<void> | void,
): (args: string, ctx: C) => Promise<void> {
  return async (args, ctx) => {
    try {
      await handler(args, ctx);
    } catch (error) {
      reportFailure(ctx, `${extensionName} command failed`, error);
    }
  };
}

/**
 * Wrap a `pi.on` handler so a failure becomes an error notification.
 *
 * The handler's result, such as a `before_agent_start` system prompt,
 * passes through unchanged. When `handler` throws or rejects, the wrapper
 * notifies `<extensionName> <eventName> failed: <message>` at error
 * severity and resolves to `undefined`, which Pi treats as no result.
 *
 * When the wrapper is passed to `pi.on`, TypeScript infers `E` and `C`
 * from the matching overload and checks the result against the event's
 * result type. Tests may call the wrapper with a narrower context.
 */
export function guardEvent<E, R, C extends GuardContext>(
  extensionName: string,
  eventName: string,
  handler: (event: E, ctx: C) => R,
): (event: E, ctx: C) => Promise<Awaited<R> | undefined> {
  return async (event: E, ctx: C): Promise<Awaited<R> | undefined> => {
    try {
      return await handler(event, ctx);
    } catch (error) {
      reportFailure(ctx, `${extensionName} ${eventName} failed`, error);

      return undefined;
    }
  };
}

/**
 * Build a `getArgumentCompletions` function for fixed subcommands.
 *
 * Only the first word completes: once the argument, ignoring leading
 * whitespace, contains a space, the function returns `null`. Otherwise it
 * returns the subcommands whose names start with the argument, labeled
 * `<name>: <description>` or just `<name>`, or `null` when none match.
 */
export function subcommandCompletions(
  subcommands: readonly SubcommandCompletion[],
): (argumentPrefix: string) => AutocompleteItem[] | null {
  return (argumentPrefix) => {
    const prefix = argumentPrefix.trimStart();

    if (prefix.includes(" ")) return null;

    const matches = subcommands
      .filter(({ name }) => name.startsWith(prefix))
      .map(({ description, name }) => ({
        label: description ? `${name}: ${description}` : name,
        value: name,
      }));

    return matches.length > 0 ? matches : null;
  };
}

/**
 * Describe a thrown value as the end of a sentence, adding a full stop
 * unless the message already ends in `.`, `!`, or `?`.
 */
function describeFailure(error: unknown): string {
  const message = describeError(error);

  return /[!.?]$/u.test(message) ? message : `${message}.`;
}

/**
 * Notify `<prefix>: <message>` at error severity.
 *
 * The notification is best effort: a handler can fail after Pi has
 * replaced its session, when the stale context's `notify` throws too, and
 * the guards promise never to reject.
 */
function reportFailure(
  ctx: GuardContext,
  prefix: string,
  error: unknown,
): void {
  try {
    ctx.ui.notify(`${prefix}: ${describeFailure(error)}`, "error");
  } catch {
    // No usable UI is left to report through.
  }
}
