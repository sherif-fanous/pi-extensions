import registerThemeSync from "../src/index.js";
import { STATUS_REPORT_ENTRY_TYPE } from "../src/ui/status-report.js";
import {
  DEFAULT_DEPRECATION_NOTICE,
  deferralNotice,
} from "./helpers/notices.js";
import {
  createFakeContext,
  createFakePi,
  createPlainTheme,
} from "@sherif-fanous/pi-extensions-testing";
import { expect, test, vi } from "vitest";

test("registers the status entry renderer and revised command description", () => {
  const fake = createFakePi();

  registerThemeSync(fake.pi);

  expect([...fake.entryRenderers.keys()]).toEqual([STATUS_REPORT_ENTRY_TYPE]);
  expect([...fake.commands.keys()]).toEqual(["theme-sync"]);

  const command = fake.command("theme-sync");

  expect(command.description).toBe("Configure Theme Sync or show its status");
  expect(command.getArgumentCompletions?.("")).toEqual([
    {
      value: "status",
      label: "status",
      description: "Show Theme Sync status",
    },
  ]);

  expect(command.getArgumentCompletions?.("sta")).toEqual([
    {
      value: "status",
      label: "status",
      description: "Show Theme Sync status",
    },
  ]);
  expect(command.getArgumentCompletions?.("status ")).toBeNull();
  expect(command.getArgumentCompletions?.("other")).toBeNull();
});

test("reports status delivery failures through the command lifecycle guard", async () => {
  const notify = vi.fn();
  const fake = createFakePi({
    appendEntry: () => {
      throw new Error("append failed");
    },
  });
  const theme = Object.assign(createPlainTheme(), { name: "dark" });

  registerThemeSync(fake.pi);
  await fake.runCommand(
    "theme-sync",
    "status",
    createFakeContext({ ui: { notify, theme } }),
  );

  expect(notify).toHaveBeenCalledWith(
    "Theme Sync command failed: append failed.",
    "error",
  );
});

test.each([
  [
    "defers when getSettings reports a theme pair",
    { getSettings: () => ({ theme: "latte/mocha" }) },
    deferralNotice("latte/mocha"),
  ],
  [
    "does not defer when getSettings throws",
    {
      getSettings: () => {
        throw new Error("settings unavailable");
      },
    },
    DEFAULT_DEPRECATION_NOTICE,
  ],
  ["does not defer without getSettings", {}, DEFAULT_DEPRECATION_NOTICE],
])("session start %s", async (_name, settingsReader, notice) => {
  const notify = vi.fn();
  const fake = createFakePi();
  const theme = Object.assign(createPlainTheme(), { name: "dark" });

  registerThemeSync(Object.assign(fake.pi, settingsReader));
  await fake.emit(
    { reason: "startup", type: "session_start" },
    createFakeContext({
      cwd: "/unused-index-test",
      isProjectTrusted: () => false,
      mode: "print",
      ui: { getAllThemes: () => [], notify, theme },
    }),
  );

  expect(notify.mock.calls[0]?.[0]).toContain(notice);
});
