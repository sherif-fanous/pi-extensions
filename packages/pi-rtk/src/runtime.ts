/**
 * RTK's state and the rtk binary calls that read and update it: the rewriting
 * toggle, whether the binary runs, the warning when it stops running, and the
 * footer badge that shows them.
 */

import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";

import { EXTENSION_NAME } from "./extension-name.js";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  alignLabelRows,
  notifyWarnings,
} from "@sherif-fanous/pi-extensions-core";

const REWRITE_TIMEOUT_MS = 5000;
const SPAWN_OPTIONS: SpawnSyncOptionsWithStringEncoding = {
  encoding: "utf-8",
  timeout: REWRITE_TIMEOUT_MS,
};
/** Footer status key: the bare slug, so Pi orders the family's entries by slug. */
const STATUS_KEY = "rtk";

/** RTK's state for one call of the extension's default export. */
export interface RtkRuntime {
  /**
   * Rewrite `command` with `rtk rewrite` while rewriting is on, or
   * `undefined` for no rewrite.
   */
  rewriteIfEnabled(command: string): string | undefined;
  /** The footer badge text, which also titles the bare `/rtk` menu. */
  rtkStateText(): string;
  /** Spawn rtk for its version and path, and build the status report body. */
  rtkStatusReport(): string;
  /**
   * Keep `ctx` for the warning and footer updates a rewrite from the bash
   * tool makes, since that runs outside any handler that receives a context.
   */
  setNotifyContext(ctx: RtkUiContext): void;
  setSessionEnabled(enabled: boolean, ctx: RtkUiContext): void;
  /** Probe the rtk binary at session start and draw the footer badge. */
  startSession(ctx: RtkUiContext): void;
}

/** Options for {@link createRtkRuntime}. */
export interface RtkRuntimeOptions {
  /** The function that runs rtk and `sh`, `spawnSync` by default. */
  readonly spawn?: RtkSpawn;
}

/** The part of a Pi context used to warn and to draw the footer badge. */
export interface RtkUiContext {
  readonly ui: Pick<ExtensionUIContext, "notify" | "setStatus" | "theme">;
}

/** Run a program to completion and collect its output, as `spawnSync` does. */
export type RtkSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => Pick<SpawnSyncReturns<string>, "error" | "stdout">;

type RtkUnavailableReason = "missing" | "unexecutable";

type SpawnErrorClassification = RtkUnavailableReason | "other";

/**
 * State that belongs to the Pi process rather than to one session. Pi keeps
 * this module loaded across `/new`, `/resume`, and `/fork` and calls the
 * default export again for each, so state kept here survives them; `/reload`
 * and a Pi restart evaluate the module again and reset it. None of it is
 * written to disk.
 */
const processState = {
  /** Whether the last spawn of the rtk binary succeeded. */
  rtkAvailable: true,
  /**
   * Whether the current outage has been reported. Availability warnings are
   * warn-once per outage: any successful rtk spawn resets the gate, and the
   * next ENOENT/EACCES may warn again.
   */
  rtkUnavailableNotified: false,
  /** The rewriting toggle, on when Pi starts. */
  sessionEnabled: true,
};

/** Create RTK's state for one call of the extension's default export. */
export function createRtkRuntime({
  spawn = spawnSync,
}: RtkRuntimeOptions = {}): RtkRuntime {
  // Pi only exposes the notify surface through handler contexts, so the
  // latest one is kept; a context from an earlier session is stale.
  let notifyContext: null | RtkUiContext = null;

  function alertRtkUnavailable(reason: RtkUnavailableReason): void {
    if (processState.rtkUnavailableNotified || notifyContext === null) return;

    const messages: Record<RtkUnavailableReason, string> = {
      missing:
        "The rtk binary was not found on PATH. Running shell commands without rewrites. See https://github.com/rtk-ai/rtk#installation to install rtk.",
      unexecutable:
        "The rtk binary on PATH is not executable. Running shell commands without rewrites. Run chmod +x $(command -v rtk) to fix it.",
    };

    processState.rtkUnavailableNotified = true;
    notifyWarnings(notifyContext, EXTENSION_NAME, [messages[reason]]);
  }

  function renderStatusText(ctx: RtkUiContext): string {
    const color =
      processState.sessionEnabled && !processState.rtkAvailable
        ? "warning"
        : "dim";

    return ctx.ui.theme.fg(color, rtkStateText());
  }

  function rewriteCommand(command: string): string | undefined {
    // rtk's exit codes are permission verdicts (0/1/2/3 = allow/no-equiv/
    // deny/ask). We trust stdout and ignore the exit code. The deny verdict
    // is intentionally not enforced — this shim rewrites, it does not gate.
    try {
      const out = runRtk(["rewrite", command])?.trimEnd() ?? "";

      return out.length > 0 ? out : undefined; // empty stdout = exit 1 or 2
    } catch {
      return undefined;
    }
  }

  function rtkStateText(): string {
    if (!processState.sessionEnabled) return `${EXTENSION_NAME}: off`;
    if (!processState.rtkAvailable) return `${EXTENSION_NAME}: unavailable`;

    return `${EXTENSION_NAME}: on`;
  }

  /**
   * Spawn rtk with `args` and record whether it ran: a missing or
   * unexecutable binary marks rtk unavailable and warns once per outage, and
   * any successful spawn marks it available and ends the outage. The stdout
   * of a spawn that ran, or `undefined` when it failed.
   */
  function runRtk(args: readonly string[]): string | undefined {
    const result = spawn("rtk", args, SPAWN_OPTIONS);

    if (result.error) {
      const reason = classifySpawnError(result.error);

      if (reason !== "other") {
        alertRtkUnavailable(reason);
        setRtkAvailable(false);
      }

      return undefined;
    }

    processState.rtkUnavailableNotified = false;
    setRtkAvailable(true);

    return result.stdout ?? "";
  }

  // Refreshes the footer badge when availability flips, because rewrites from
  // the bash tool happen outside any handler that receives a context.
  function setRtkAvailable(available: boolean): void {
    if (processState.rtkAvailable === available) return;

    processState.rtkAvailable = available;

    if (notifyContext !== null) updateFooterStatus(notifyContext);
  }

  function updateFooterStatus(ctx: RtkUiContext): void {
    ctx.ui.setStatus(STATUS_KEY, renderStatusText(ctx));
  }

  return {
    rewriteIfEnabled(command) {
      if (!processState.sessionEnabled) return undefined;

      return rewriteCommand(command);
    },
    rtkStateText,
    rtkStatusReport() {
      const version = runRtk(["--version"]);

      let binary = "rtk not detected on PATH";

      if (version !== undefined) {
        const path = spawn("sh", ["-c", "command -v rtk"], SPAWN_OPTIONS);
        const versionText = version.trim() || "version unknown";
        const pathText = (path.stdout ?? "").trim();

        binary =
          pathText.length > 0 ? `${versionText} at ${pathText}` : versionText;
      }

      return [
        `${EXTENSION_NAME} Status`,
        ...alignLabelRows([
          ["Rewriting:", processState.sessionEnabled ? "on" : "off"],
          ["Binary:", binary],
          ["Tip:", "Bypass rtk for one command with !RTK_DISABLED=1 <cmd>."],
        ]),
      ].join("\n");
    },
    setNotifyContext(ctx) {
      notifyContext = ctx;
    },
    setSessionEnabled(enabled, ctx) {
      processState.sessionEnabled = enabled;
      updateFooterStatus(ctx);
    },
    startSession(ctx) {
      notifyContext = ctx;
      runRtk(["--version"]);
      updateFooterStatus(ctx);
    },
  };
}

function classifySpawnError(
  err: NodeJS.ErrnoException,
): SpawnErrorClassification {
  if (err.code === "ENOENT") return "missing";
  if (err.code === "EACCES") return "unexecutable";

  return "other";
}
