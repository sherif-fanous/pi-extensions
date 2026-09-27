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
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import {
  alignLabelRows,
  createCommandReport,
  guardCommand,
  guardEvent,
  notifyWarnings,
  subcommandCompletions,
} from "@sherif-fanous/pi-extensions-core";

const REWRITE_TIMEOUT_MS = 5000;
const STATUS_REPORT = createCommandReport("rtk:status-report");
const VALID_RTK_SUBCOMMANDS = ["enable", "disable", "status"] as const;

// Session state is intentionally in-memory only: it resets to enabled on every
// Pi process start and is never persisted to disk.
let sessionEnabled = true;

// Whether the last spawn of the rtk binary succeeded. ENOENT and EACCES mark it
// unavailable; other spawn failures leave it unchanged.
let rtkAvailable = true;

/** The part of a Pi context used to warn and to draw the footer badge. */
interface RtkUiContext {
  readonly ui: Pick<ExtensionUIContext, "notify" | "setStatus" | "theme">;
}

type RtkSubcommand = (typeof VALID_RTK_SUBCOMMANDS)[number];
type RtkUnavailableReason = "missing" | "unexecutable";

type SpawnErrorClassification = RtkUnavailableReason | "other";

// Availability notifications are warn-once per outage: a successful rewrite
// spawn resets the gate, and the next ENOENT/EACCES may warn again. Pi only
// exposes the TUI notify surface through lifecycle context, so the context is
// captured from the first relevant event rather than at module load.
let rtkUnavailableNotified = false;
let cachedNotifyContext: null | RtkUiContext = null;

function alertRtkUnavailable(reason: RtkUnavailableReason): void {
  if (rtkUnavailableNotified || cachedNotifyContext === null) return;

  const messages: Record<RtkUnavailableReason, string> = {
    missing:
      "The rtk binary was not found on PATH. Running shell commands without rewrites. See https://github.com/rtk-ai/rtk#installation to install rtk.",
    unexecutable:
      "The rtk binary on PATH is not executable. Running shell commands without rewrites. Run chmod +x $(command -v rtk) to fix it.",
  };

  rtkUnavailableNotified = true;
  notifyWarnings(cachedNotifyContext, "RTK", [messages[reason]]);
}

function cacheNotifyContext(ctx: RtkUiContext): void {
  if (cachedNotifyContext === null) cachedNotifyContext = ctx;
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

function markRtkUnavailable(reason: RtkUnavailableReason): void {
  alertRtkUnavailable(reason);
  setRtkAvailable(false);
}

function renderStatusText(ctx: RtkUiContext): string {
  const { theme } = ctx.ui;

  if (!isSessionEnabled()) return theme.fg("dim", "RTK: off");
  if (!rtkAvailable) return theme.fg("warning", "RTK: unavailable");

  return theme.fg("dim", "RTK: on");
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

      if (reason !== "other") markRtkUnavailable(reason);

      return undefined;
    }

    rtkUnavailableNotified = false;
    setRtkAvailable(true);

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

    if (reason !== "other") markRtkUnavailable(reason);
  } else {
    rtkUnavailableNotified = false;
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
    "RTK Status",
    ...alignLabelRows([
      ["Session toggle:", isSessionEnabled() ? "enabled" : "disabled"],
      ["Binary:", binary],
      ["Tip:", "bypass rtk for one command with !RTK_DISABLED=1 <cmd>."],
    ]),
  ].join("\n");
}

// Refreshes the footer badge when availability flips, because rewrites from
// the bash tool happen outside any handler that receives a context.
function setRtkAvailable(available: boolean): void {
  if (rtkAvailable === available) return;

  rtkAvailable = available;

  if (cachedNotifyContext !== null) updateFooterStatus(cachedNotifyContext);
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

function updateFooterStatus(ctx: RtkUiContext): void {
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
      cacheNotifyContext(ctx);

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
    }),
  );

  // A failure here resolves to no result, so Pi runs the command itself.
  pi.on(
    "user_bash",
    guardEvent("RTK", "user_bash", (event, ctx) => {
      cacheNotifyContext(ctx);

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
