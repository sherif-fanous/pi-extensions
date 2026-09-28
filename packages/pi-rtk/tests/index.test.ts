/**
 * Covers RTK's wiring into Pi: the rewriting of `!` commands and of the
 * agent's `bash` tool, the `/rtk` command's replies, and the text RTK shows
 * against the family standard.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionUIContext,
  UserBashEvent,
  UserBashEventResult,
} from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakePi,
  createMarkerTheme,
  createPlainTheme,
  createShownTextRecorder,
  findShownTextViolations,
  type FakeCommand,
  type FakePi,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exec: vi.fn(), spawnSync: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: mocks.spawnSync,
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  createLocalBashOperations: () => ({ exec: mocks.exec }),
}));

interface FakeContext {
  readonly ctx: ExtensionCommandContext;
  readonly notify: ReturnType<typeof vi.fn>;
  readonly setStatus: ReturnType<typeof vi.fn>;
}

interface LoadedRtk {
  readonly command: FakeCommand["handler"];
  readonly commandOptions: FakeCommand;
  /** Call RTK's handlers for a session start or a `!` command. */
  readonly emit: FakePi["emit"];
  readonly tools: FakePi["tools"];
}

/** Surfaces a test may replace on the fake context. */
type FakeUi = Pick<
  ExtensionUIContext,
  "notify" | "select" | "setStatus" | "theme"
>;

const RTK_MISSING = {
  error: Object.assign(new Error("spawnSync rtk ENOENT"), { code: "ENOENT" }),
  stdout: "",
};
const RTK_WORKS = { error: undefined, stdout: "rtk 0.30.0\n" };

/**
 * Load a fresh copy of the extension, as a Pi restart or `/reload` does,
 * since its toggle is module state.
 */
async function loadRtk(
  appendEntry?: ExtensionAPI["appendEntry"],
): Promise<LoadedRtk> {
  vi.resetModules();

  const { default: rtk } = await import("../src/index.js");
  const fake = createFakePi({ appendEntry });

  rtk(fake.pi);

  const commandOptions = fake.command("rtk");

  return {
    command: commandOptions.handler,
    commandOptions,
    emit: fake.emit,
    tools: fake.tools,
  };
}

function makeContext(
  mode: ExtensionContext["mode"] = "tui",
  overrides: Partial<FakeUi> = {},
): FakeContext {
  const notify = vi.fn();
  const setStatus = vi.fn();
  const ctx = createFakeContext({
    mode,
    ui: {
      notify,
      select: () => Promise.resolve(undefined),
      setStatus,
      theme: createMarkerTheme(),
      ...overrides,
    },
  });

  return { ctx, notify, setStatus };
}

function userBashEvent(command: string): UserBashEvent {
  return {
    command,
    cwd: "/project",
    excludeFromContext: false,
    type: "user_bash",
  };
}

beforeEach(() => {
  mocks.exec.mockReset();
  mocks.spawnSync.mockReset();
  mocks.spawnSync.mockReturnValue(RTK_WORKS);
});

describe("! commands", () => {
  it("runs rtk's rewrite of the command", async () => {
    const { emit } = await loadRtk();
    const { ctx } = makeContext();

    mocks.spawnSync.mockReturnValue({
      error: undefined,
      stdout: "rtk git status\n",
    });

    const [result] = await emit(userBashEvent("git status"), ctx);
    const onData = (): void => undefined;

    await (result as UserBashEventResult).operations?.exec(
      "git status",
      "/project",
      { onData },
    );

    expect(mocks.exec).toHaveBeenCalledExactlyOnceWith(
      "rtk git status",
      "/project",
      { onData },
    );
  });

  it("leaves !! commands alone, so their output stays out of the model's context", async () => {
    const { emit } = await loadRtk();
    const { ctx } = makeContext();

    const results = await emit(
      { ...userBashEvent("git status"), excludeFromContext: true },
      ctx,
    );

    expect(results).toEqual([undefined]);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });
});

describe("bash tool", () => {
  it("runs rtk's rewrite of the agent's command", async () => {
    const { tools } = await loadRtk();
    const ctx = createFakeContext({ cwd: process.cwd() });

    mocks.spawnSync.mockReturnValue({
      error: undefined,
      stdout: "echo rewritten\n",
    });

    const result = await tools
      .get("bash")
      ?.execute(
        "call",
        { command: "echo original" },
        undefined,
        undefined,
        ctx,
      );

    expect(mocks.spawnSync).toHaveBeenCalledExactlyOnceWith(
      "rtk",
      ["rewrite", "echo original"],
      expect.anything(),
    );
    expect(result?.content).toEqual([{ text: "rewritten\n", type: "text" }]);
  });
});

describe("/rtk command", () => {
  it("runs the subcommand whose description the user picks from bare /rtk", async () => {
    const select = vi.fn((_title: string, options: string[]) =>
      Promise.resolve(options[1]),
    );
    const { command, emit } = await loadRtk();
    const { ctx, notify, setStatus } = makeContext("tui", { select });

    await emit({ reason: "startup", type: "session_start" }, ctx);
    await command("", ctx);

    expect(select).toHaveBeenCalledWith("RTK: on", [
      "Rewrite shell commands with RTK",
      "Stop rewriting shell commands",
      "Show RTK status",
    ]);
    expect(notify).toHaveBeenCalledWith("Command rewriting disabled.", "info");
    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: off</dim>");
  });

  it("opens the menu for an RPC client", async () => {
    const select = vi.fn(() => Promise.resolve(undefined));
    const { command } = await loadRtk();
    const { ctx } = makeContext("rpc", { select });

    await command("", ctx);

    expect(select).toHaveBeenCalledOnce();
  });

  it("shows the status report instead of the menu in print mode", async () => {
    const select = vi.fn(() => Promise.resolve(undefined));
    const { command } = await loadRtk();
    const { ctx, notify } = makeContext("print", { select });

    await command("", ctx);

    expect(select).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^<accent><b>RTK Status<\/b><\/accent>\n/u),
      "info",
    );
  });

  it("warns about an unknown subcommand and lists every form", async () => {
    const { command } = await loadRtk();
    const { ctx, notify } = makeContext();

    await command("status foo", ctx);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      'RTK: 1 warning\n- Unknown subcommand "status foo". Try /rtk, /rtk enable, /rtk disable, or /rtk status.',
      "warning",
    );
  });
});

describe("shown text", () => {
  it("follows the family text standard on every main path", async () => {
    mocks.spawnSync.mockImplementation((command: string, args: string[]) =>
      command === "sh"
        ? { error: undefined, stdout: "/usr/local/bin/rtk\n" }
        : args[0] === "--version"
          ? RTK_WORKS
          : RTK_MISSING,
    );

    const shown = createShownTextRecorder({
      choose: (_title, options) => options.at(-1),
    });
    const { command, commandOptions, emit } = await loadRtk(shown.appendEntry);
    const ui = {
      notify: shown.notify,
      select: shown.select,
      setStatus: shown.setStatus,
      theme: createPlainTheme(),
    };
    const { ctx: tuiCtx } = makeContext("tui", ui);
    const { ctx: rpcCtx } = makeContext("rpc", ui);

    await shown.recordCommand(commandOptions);
    await emit({ reason: "startup", type: "session_start" }, tuiCtx);
    await emit(userBashEvent("git status"), tuiCtx);

    for (const args of ["", "enable", "disable", "status", "nope"]) {
      await command(args, tuiCtx);
    }

    await command("status", rpcCtx);

    expect(
      findShownTextViolations(shown, { displayName: "RTK", slug: "rtk" }),
    ).toEqual([]);

    expect(shown.texts.map(({ surface }) => surface)).toEqual(
      expect.arrayContaining([
        "description",
        "notification",
        "report",
        "select",
        "status",
      ]),
    );
  });
});
