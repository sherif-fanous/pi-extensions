/**
 * RTK's state and the rtk binary calls that read and update it: the rewriting
 * toggle, whether the binary runs, the warning when it stops running, and the
 * footer badge that shows them.
 */

import { spawnSync } from "node:child_process";

import { EXTENSION_NAME } from "./extension-name.js";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  alignLabelRows,
  notifyWarnings,
} from "@sherif-fanous/pi-extensions-core";

const REWRITE_TIMEOUT_MS = 5000;
/** Footer status key: the bare slug, so Pi orders the family's entries by slug. */
const STATUS_KEY = "rtk";

/** RTK's state for one call of the extension's default export. */
export interface RtkRuntime {
  isSessionEnabled(): boolean;
  /** Rewrite `command` with `rtk rewrite`, or `undefined` for no rewrite. */
  rewriteCommand(command: string): string | undefined;
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

/** The part of a Pi context used to warn and to draw the footer badge. */
export interface RtkUiContext {
  readonly ui: Pick<ExtensionUIContext, "notify" | "setStatus" | "theme">;
}

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
   * warn-once per outage: a successful rewrite spawn resets the gate, and the
   * next ENOENT/EACCES may warn again.
   */
  rtkUnavailableNotified: false,
  /** The rewriting toggle, on when Pi starts. */
  sessionEnabled: true,
};

/** Create RTK's state for one call of the extension's default export. */
export function createRtkRuntime(): RtkRuntime {
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

  function markRtkUnavailable(reason: RtkUnavailableReason): void {
    alertRtkUnavailable(reason);
    setRtkAvailable(false);
  }

  function renderStatusText(ctx: RtkUiContext): string {
    const color =
      processState.sessionEnabled && !processState.rtkAvailable
        ? "warning"
        : "dim";

    return ctx.ui.theme.fg(color, rtkStateText());
  }

  function rtkStateText(): string {
    if (!processState.sessionEnabled) return `${EXTENSION_NAME}: off`;
    if (!processState.rtkAvailable) return `${EXTENSION_NAME}: unavailable`;

    return `${EXTENSION_NAME}: on`;
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
    isSessionEnabled: () => processState.sessionEnabled,
    rewriteCommand(command) {
      // rtk's exit codes are permission verdicts (0/1/2/3 = allow/no-equiv/
      // deny/ask). We trust stdout and ignore the exit code. The deny verdict
      // is intentionally not enforced — this shim rewrites, it does not gate.
      try {
        const result = spawnSync("rtk", ["rewrite", command], {
          encoding: "utf-8",
          timeout: REWRITE_TIMEOUT_MS,
        });

        if (result.error) {
          const reason = classifySpawnError(result.error);

          if (reason !== "other") markRtkUnavailable(reason);

          return undefined;
        }

        processState.rtkUnavailableNotified = false;
        setRtkAvailable(true);

        const out = (result.stdout ?? "").trimEnd();

        return out.length > 0 ? out : undefined; // empty stdout = exit 1 or 2
      } catch {
        return undefined;
      }
    },
    rtkStateText,
    rtkStatusReport() {
      const version = spawnSync("rtk", ["--version"], {
        encoding: "utf-8",
        timeout: REWRITE_TIMEOUT_MS,
      });

      let binary = "rtk not detected on PATH";

      if (version.error) {
        const reason = classifySpawnError(version.error);

        if (reason !== "other") markRtkUnavailable(reason);
      } else {
        processState.rtkUnavailableNotified = false;
        setRtkAvailable(true);

        const path = spawnSync("sh", ["-c", "command -v rtk"], {
          encoding: "utf-8",
          timeout: REWRITE_TIMEOUT_MS,
        });
        const versionText = (version.stdout ?? "").trim() || "version unknown";
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

      const result = spawnSync("rtk", ["--version"], {
        timeout: REWRITE_TIMEOUT_MS,
      });

      if (result.error) {
        const reason = classifySpawnError(result.error);

        if (reason !== "other") markRtkUnavailable(reason);
      } else {
        setRtkAvailable(true);
      }

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
