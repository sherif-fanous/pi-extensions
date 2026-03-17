import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Appearance } from "../../types.js";

const execFileAsync = promisify(execFile);

export async function detectAppearanceViaSystem(): Promise<Appearance> {
  try {
    if (process.platform === "darwin") {
      try {
        const { stdout } = await execFileAsync("defaults", [
          "read",
          "-g",
          "AppleInterfaceStyle",
        ]);

        return stdout.trim().toLowerCase() === "dark" ? "dark" : "light";
      } catch {
        // Key does not exist when light mode is active
        return "light";
      }
    }

    if (process.platform === "linux") {
      try {
        const { stdout } = await execFileAsync("gsettings", [
          "get",
          "org.gnome.desktop.interface",
          "color-scheme",
        ]);

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
      const { stdout } = await execFileAsync("reg", [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        "/v",
        "AppsUseLightTheme",
      ]);

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
