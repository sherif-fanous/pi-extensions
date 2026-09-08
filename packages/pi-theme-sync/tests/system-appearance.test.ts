import { detectAppearanceViaSystem } from "../src/detectors/system/appearance.js";
import { afterEach, expect, test, vi } from "vitest";

const missingPreference =
  "The domain/default pair of (kCFPreferencesAnyApplication, AppleInterfaceStyle) does not exist";

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each([
  {
    platform: "darwin",
    command: "defaults",
    stdout: "Dark\n",
    expected: "dark",
  },
  {
    platform: "darwin",
    command: "defaults",
    stdout: "Light\n",
    expected: "light",
  },
  {
    platform: "linux",
    command: "gsettings",
    stdout: "'prefer-dark'\n",
    expected: "dark",
  },
  {
    platform: "linux",
    command: "gsettings",
    stdout: "'prefer-light'\n",
    expected: "light",
  },
  {
    platform: "linux",
    command: "gsettings",
    stdout: "'default'\n",
    expected: "unknown",
  },
  {
    platform: "win32",
    command: "reg",
    stdout: "AppsUseLightTheme REG_DWORD 0x0",
    expected: "dark",
  },
  {
    platform: "win32",
    command: "reg",
    stdout: "AppsUseLightTheme REG_DWORD 0x1",
    expected: "light",
  },
  {
    platform: "win32",
    command: "reg",
    stdout: "unexpected",
    expected: "unknown",
  },
])(
  "classifies $platform output $stdout with a bounded command",
  async ({ platform, command, stdout, expected }) => {
    vi.stubGlobal("process", { ...process, platform });

    const runCommand = vi.fn().mockResolvedValue({ stdout });

    expect(await detectAppearanceViaSystem(runCommand)).toBe(expected);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith(
      command,
      expect.any(Array),
      { timeout: 1000 },
    );
  },
);

test("an absent macOS appearance preference means light", async () => {
  vi.stubGlobal("process", { ...process, platform: "darwin" });

  const runCommand = vi.fn().mockRejectedValue(
    Object.assign(new Error("defaults failed"), {
      code: 1,
      stderr: `2026-09-07 defaults[123:456]\n${missingPreference}\n`,
    }),
  );

  expect(await detectAppearanceViaSystem(runCommand)).toBe("light");
});

test.each(["darwin", "linux", "win32"])(
  "%s command failures and timeouts remain unknown",
  async (platform) => {
    vi.stubGlobal("process", { ...process, platform });

    for (const failure of [
      { code: "ENOENT" },
      { code: "EACCES" },
      { code: 1, stderr: "Permission denied" },
      { code: 2, stderr: missingPreference },
      { code: 1, killed: true, signal: "SIGTERM", stderr: missingPreference },
      { code: 1, signal: "SIGTERM", stderr: missingPreference },
    ]) {
      const runCommand = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("command failed"), failure));

      expect(await detectAppearanceViaSystem(runCommand)).toBe("unknown");
      expect(runCommand).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        { timeout: 1000 },
      );
    }
  },
);

test("unsupported platforms do not run a command", async () => {
  vi.stubGlobal("process", { ...process, platform: "freebsd" });

  const runCommand = vi.fn();

  expect(await detectAppearanceViaSystem(runCommand)).toBe("unknown");
  expect(runCommand).not.toHaveBeenCalled();
});
