import registerThemeSync from "../src/index.js";
import { STATUS_REPORT_ENTRY_TYPE } from "../src/ui/status-report.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";

test("registers the status entry renderer and revised command description", () => {
  const registerEntryRenderer = vi.fn();
  const registerCommand = vi.fn();
  const pi = {
    on: vi.fn(),
    registerCommand,
    registerEntryRenderer,
  };

  registerThemeSync(pi as never);

  expect(registerEntryRenderer).toHaveBeenCalledWith(
    STATUS_REPORT_ENTRY_TYPE,
    expect.any(Function),
  );

  expect(registerCommand).toHaveBeenCalledOnce();

  const command = registerCommand.mock.calls[0]?.[1] as unknown as {
    description: string;
    getArgumentCompletions(
      prefix: string,
    ): { value: string; label: string }[] | null;
  };

  expect(command.description).toBe("Configure theme sync or report its status");
  expect(command.getArgumentCompletions("")).toEqual([
    { value: "status", label: "status: show theme sync status" },
  ]);

  expect(command.getArgumentCompletions("sta")).toEqual([
    { value: "status", label: "status: show theme sync status" },
  ]);
  expect(command.getArgumentCompletions("status ")).toBeNull();
  expect(command.getArgumentCompletions("other")).toBeNull();
});

test("reports status delivery failures through the command lifecycle guard", async () => {
  let handler:
    ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
  const notify = vi.fn();
  const pi = {
    appendEntry: vi.fn(() => {
      throw new Error("append failed");
    }),
    on: vi.fn(),
    registerCommand: vi.fn(
      (
        _name: string,
        command: {
          handler: (
            args: string,
            ctx: ExtensionCommandContext,
          ) => Promise<void>;
        },
      ) => {
        handler = command.handler;
      },
    ),
    registerEntryRenderer: vi.fn(),
  };
  const ctx = {
    mode: "tui",
    ui: {
      notify,
      theme: {
        bold: (text: string) => text,
        fg: (_color: string, text: string) => text,
        name: "dark",
      },
    },
  } as unknown as ExtensionCommandContext;

  registerThemeSync(pi as never);
  await handler?.("status", ctx);

  expect(notify).toHaveBeenCalledWith(
    "Theme sync command failed: append failed.",
    "error",
  );
});
