import registerThemeSync from "../src/index.js";
import { STATUS_REPORT_ENTRY_TYPE } from "../src/ui/status-report.js";
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
