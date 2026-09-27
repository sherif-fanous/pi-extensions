/**
 * pi-rtk — Pi extension that uses `rtk rewrite` to optimize shell commands.
 *
 * The extension participates in two Pi execution paths:
 * - agent-initiated `bash` tool calls via a replacement bash tool
 * - user-issued `!<cmd>` shell commands via the `user_bash` event
 *
 * In both paths, optimization is best-effort: when `rtk rewrite` succeeds,
 * Pi executes the rewritten command; when rewrite fails, times out, or `rtk`
 * is unavailable, execution falls back to Pi's normal shell behavior.
 *
 * Commands entered with `!!<cmd>` are intentionally not intercepted so the
 * user's choice to exclude shell output from model context is preserved.
 */

import { spawnSync } from "node:child_process";

import {
  createBashTool,
  createLocalBashOperations,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  alignLabelRows,
  createCommandReport,
  guardCommand,
  guardEvent,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

const REWRITE_TIMEOUT_MS = 5000;
const STATUS_REPORT = createCommandReport("rtk:status-report");
const VALID_RTK_SUBCOMMANDS = ["enable", "disable", "status"] as const;

// Session state is intentionally in-memory only: it resets to enabled on every
// Pi process start and is never persisted to disk.
let sessionEnabled = true;

type Notify = (message: string, level: "info" | "warning" | "error") => void;
type RtkSubcommand = (typeof VALID_RTK_SUBCOMMANDS)[number];
type RtkUnavailableReason = "missing" | "unexecutable";

type SpawnErrorClassification = RtkUnavailableReason | "other";

// Availability notifications are warn-once per outage: a successful rewrite
// spawn resets the gate, and the next ENOENT/EACCES may warn again. Pi only
// exposes the TUI notify surface through lifecycle context, so the callable is
// captured from the first relevant event rather than at module load.
let rtkUnavailableNotified = false;
let cachedNotify: Notify | null = null;

function alertRtkUnavailable(reason: RtkUnavailableReason): void {
  if (rtkUnavailableNotified || cachedNotify === null) return;

  const messages: Record<RtkUnavailableReason, string> = {
    missing:
      "[pi-rtk] rtk binary not found on PATH. Shell command rewrites are disabled. Install rtk: https://github.com/rtk-ai/rtk#installation",
    unexecutable:
      "[pi-rtk] rtk binary found on PATH but is not executable. Shell command rewrites are disabled. Run: chmod +x $(command -v rtk)",
  };

  rtkUnavailableNotified = true;
  cachedNotify(messages[reason], "warning");
}

function cacheNotify(notify: Notify): void {
  if (cachedNotify === null) cachedNotify = notify;
}

function classifySpawnError(
  err: NodeJS.ErrnoException,
): SpawnErrorClassification {
  if (err.code === "ENOENT") return "missing";
  if (err.code === "EACCES") return "unexecutable";

  return "other";
}

function handleRtkSubcommand(
  subcommand: RtkSubcommand,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): void {
  if (subcommand === "status") {
    showRtkStatus(ctx, pi);

    return;
  }

  setSessionEnabled(subcommand === "enable");
  updateFooterStatus(ctx);
  ctx.ui.notify(`pi-rtk ${subcommand}d for this session`, "info");
}

function isRtkSubcommand(value: string): value is RtkSubcommand {
  return (VALID_RTK_SUBCOMMANDS as readonly string[]).includes(value);
}

function isSessionEnabled(): boolean {
  return sessionEnabled;
}

function renderStatusText(ctx: ExtensionContext): string {
  return isSessionEnabled()
    ? ctx.ui.theme.fg("success", "rtk ✓")
    : ctx.ui.theme.fg("error", "rtk ✗");
}

function rtkRewriteCommand(command: string): string | undefined {
  // rtk's exit codes are permission verdicts (0/1/2/3 = allow/no-equiv/deny/
  // ask). We trust stdout and ignore the exit code. The deny verdict is
  // intentionally not enforced — this shim rewrites, it does not gate. Spawn
  // availability errors are handled above by the transition-based notify gate.
  try {
    const result = spawnSync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: REWRITE_TIMEOUT_MS,
    });

    if (result.error) {
      const reason = classifySpawnError(result.error);

      if (reason !== "other") alertRtkUnavailable(reason);

      return undefined;
    }

    rtkUnavailableNotified = false;

    const out = (result.stdout ?? "").trimEnd();

    return out.length > 0 ? out : undefined; // empty stdout = exit 1 or 2
  } catch {
    return undefined;
  }
}

function rtkStatusReport(): string {
  const version = spawnSync("rtk", ["--version"], {
    encoding: "utf-8",
    timeout: REWRITE_TIMEOUT_MS,
  });

  let binary = "rtk not detected on PATH";

  if (version.error) {
    const reason = classifySpawnError(version.error);

    if (reason !== "other") alertRtkUnavailable(reason);
  } else {
    rtkUnavailableNotified = false;

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
    "RTK Status",
    ...alignLabelRows([
      ["Session toggle:", isSessionEnabled() ? "enabled" : "disabled"],
      ["Binary:", binary],
      ["Tip:", "bypass rtk for one command with !RTK_DISABLED=1 <cmd>."],
    ]),
  ].join("\n");
}

function setSessionEnabled(enabled: boolean): void {
  sessionEnabled = enabled;
}

async function showRtkOverlay(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<void> {
  const selected = await ctx.ui.select("pi-rtk", [
    "enable",
    "disable",
    "status",
  ]);

  if (selected === undefined || !isRtkSubcommand(selected)) return;

  handleRtkSubcommand(selected, ctx, pi);
}

function showRtkStatus(ctx: ExtensionContext, pi: ExtensionAPI): void {
  STATUS_REPORT.deliver(ctx, pi, { body: rtkStatusReport() });
}

function updateFooterStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus("pi-rtk", renderStatusText(ctx));
}

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const localBashOperations = createLocalBashOperations();

  const bashTool = createBashTool(cwd, {
    spawnHook: ({ command, cwd, env }) => {
      if (!isSessionEnabled()) return { command, cwd, env };

      return { command: rtkRewriteCommand(command) ?? command, cwd, env };
    },
  });

  pi.registerTool(bashTool);
  STATUS_REPORT.register(pi);
  pi.registerCommand("rtk", {
    description: "Control pi-rtk shell command rewriting",
    getArgumentCompletions: subcommandCompletions(
      VALID_RTK_SUBCOMMANDS.map((name) => ({ name })),
    ),
    handler: guardCommand("RTK", async (args, ctx) => {
      const subcommand = args.trim();

      if (subcommand.length === 0) {
        await showRtkOverlay(ctx, pi);

        return;
      }

      if (!isRtkSubcommand(subcommand)) {
        ctx.ui.notify(
          "Unknown /rtk subcommand. Valid forms: /rtk enable, /rtk disable, /rtk status.",
          "error",
        );

        return;
      }

      handleRtkSubcommand(subcommand, ctx, pi);
    }),
  });

  pi.on(
    "session_start",
    guardEvent("RTK", "session_start", (_event, ctx) => {
      cacheNotify((message, level) => ctx.ui.notify(message, level));
      updateFooterStatus(ctx);

      const result = spawnSync("rtk", ["--version"], {
        timeout: REWRITE_TIMEOUT_MS,
      });

      if (!result.error) return;

      const reason = classifySpawnError(result.error);

      if (reason !== "other") alertRtkUnavailable(reason);
    }),
  );

  // A failure here resolves to no result, so Pi runs the command itself.
  pi.on(
    "user_bash",
    guardEvent("RTK", "user_bash", (event, ctx) => {
      cacheNotify((message, level) => ctx.ui.notify(message, level));

      if (event.excludeFromContext) {
        return;
      }

      if (!isSessionEnabled()) {
        return;
      }

      const rewritten = rtkRewriteCommand(event.command);

      if (rewritten === undefined) {
        return;
      }

      return {
        operations: {
          exec: (_command, cwd, options) => {
            return localBashOperations.exec(rewritten, cwd, options);
          },
        },
      };
    }),
  );
}
