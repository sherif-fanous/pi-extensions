/** Detects system appearance through platform preference commands. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Appearance } from "../../types.js";

const execFileAsync = promisify(execFile);
const systemQueryTimeoutMs = 1000;

type RunSystemCommand = (
  command: string,
  args: string[],
  options: { timeout: number },
) => Promise<{ stdout: string }>;

/** Reads the current macOS, Linux, or Windows appearance preference. */
export async function detectAppearanceViaSystem(
  runCommand: RunSystemCommand = execFileAsync,
): Promise<Appearance> {
  try {
    if (process.platform === "darwin") {
      try {
        const { stdout } = await runCommand(
          "defaults",
          ["read", "-g", "AppleInterfaceStyle"],
          { timeout: systemQueryTimeoutMs },
        );

        return stdout.trim().toLowerCase() === "dark" ? "dark" : "light";
      } catch (error) {
        // Only an absent preference means light; execution failures do not.
        const failure = error as {
          code?: number | string;
          killed?: boolean;
          signal?: string | null;
          stderr?: string;
        };

        return failure.code === 1 &&
          !failure.killed &&
          !failure.signal &&
          /The domain\/default pair of \(kCFPreferencesAnyApplication, AppleInterfaceStyle\) does not exist/.test(
            failure.stderr ?? "",
          )
          ? "light"
          : "unknown";
      }
    }

    if (process.platform === "linux") {
      try {
        const { stdout } = await runCommand(
          "gsettings",
          ["get", "org.gnome.desktop.interface", "color-scheme"],
          { timeout: systemQueryTimeoutMs },
        );

        const text = stdout.trim().toLowerCase();

        if (text.includes("dark")) {
          return "dark";
        }

        if (text.includes("light")) {
          return "light";
        }

        return "unknown";
      } catch {
        return "unknown";
      }
    }

    if (process.platform === "win32") {
      const { stdout } = await runCommand(
        "reg",
        [
          "query",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
          "/v",
          "AppsUseLightTheme",
        ],
        { timeout: systemQueryTimeoutMs },
      );

      if (/0x0\b/.test(stdout)) {
        return "dark";
      }

      if (/0x1\b/.test(stdout)) {
        return "light";
      }

      return "unknown";
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}
