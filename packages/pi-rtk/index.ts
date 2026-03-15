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
 * For `user_bash`, Pi currently exposes custom bash operations rather than a
 * command-rewrite hook, so this extension provides a thin local execution shim
 * that mirrors Pi's default shell execution semantics as closely as possible.
 *
 * Commands entered with `!!<cmd>` are intentionally not intercepted so the
 * user's choice to exclude shell output from model context is preserved.
 */

import type {
  BashOperations,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { createBashTool, getShellConfig } from "@mariozechner/pi-coding-agent";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const REWRITE_TIMEOUT_MS = 5000;

function rtkRewriteCommand(command: string): string | undefined {
  try {
    return execFileSync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: REWRITE_TIMEOUT_MS,
    }).trimEnd();
  } catch {
    return undefined;
  }
}

function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        detached: true,
      });
    } catch {}
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
}

function createLocalBashOperations(): BashOperations {
  return {
    exec: (command, cwd, { onData, signal, timeout, env }) => {
      return new Promise((resolve, reject) => {
        const { shell, args } = getShellConfig();

        if (!existsSync(cwd)) {
          reject(
            new Error(
              `Working directory does not exist: ${cwd}\nCannot execute bash commands.`,
            ),
          );

          return;
        }

        const child = spawn(shell, [...args, command], {
          cwd,
          detached: true,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;

            if (child.pid) {
              killProcessTree(child.pid);
            }
          }, timeout * 1000);
        }

        if (child.stdout) {
          child.stdout.on("data", onData);
        }
        if (child.stderr) {
          child.stderr.on("data", onData);
        }

        const onAbort = () => {
          if (child.pid) {
            killProcessTree(child.pid);
          }
        };

        if (signal) {
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener("abort", onAbort, { once: true });
          }
        }

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (signal) signal.removeEventListener("abort", onAbort);

          reject(err);
        });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (signal) signal.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            reject(new Error("aborted"));

            return;
          }

          if (timedOut) {
            reject(new Error(`timeout:${timeout}`));

            return;
          }

          resolve({ exitCode: code });
        });
      });
    },
  };
}

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const localBashOperations = createLocalBashOperations();

  const bashTool = createBashTool(cwd, {
    spawnHook: ({ command, cwd, env }) => {
      return { command: rtkRewriteCommand(command) ?? command, cwd, env };
    },
  });

  pi.registerTool(bashTool);

  pi.on("user_bash", (event) => {
    if (event.excludeFromContext) {
      return;
    }

    if (!rtkRewriteCommand(event.command)) {
      return;
    }

    return {
      operations: {
        exec: (command, cwd, options) => {
          return localBashOperations.exec(
            rtkRewriteCommand(command) ?? command,
            cwd,
            options,
          );
        },
      },
    };
  });
}
