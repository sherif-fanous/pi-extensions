/**
 * Covers RTK's footer badge (toggle state and rtk binary availability), the
 * `/rtk` command's replies, and the text RTK shows against the family
 * standard.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionHandler,
  ExtensionUIContext,
  RegisteredCommand,
  SessionStartEvent,
  UserBashEvent,
  UserBashEventResult,
} from "@earendil-works/pi-coding-agent";
import {
  createMarkerTheme,
  createPlainTheme,
  createShownTextRecorder,
  findShownTextViolations,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawnSync: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: mocks.spawnSync,
}));

interface FakeContext {
  readonly ctx: ExtensionCommandContext;
  readonly notify: ReturnType<typeof vi.fn>;
  readonly setStatus: ReturnType<typeof vi.fn>;
}

interface LoadedRtk {
  readonly command: CommandHandler;
  readonly commandOptions: RegisteredCommandOptions;
  readonly sessionStart: SessionStartHandler;
  readonly userBash: UserBashHandler;
}

type CommandHandler = RegisteredCommand["handler"];

/** Surfaces a test may replace on the fake context. */
type FakeUi = Pick<
  ExtensionUIContext,
  "notify" | "select" | "setStatus" | "theme"
>;

type RegisteredCommandOptions = Parameters<ExtensionAPI["registerCommand"]>[1];
type SessionStartHandler = ExtensionHandler<SessionStartEvent>;
type UserBashHandler = ExtensionHandler<UserBashEvent, UserBashEventResult>;

const RTK_MISSING = {
  error: Object.assign(new Error("spawnSync rtk ENOENT"), { code: "ENOENT" }),
  stdout: "",
};
const RTK_WORKS = { error: undefined, stdout: "rtk 0.30.0\n" };

/** Load a fresh copy of the extension, since its toggle is module state. */
async function loadRtk(
  appendEntry: ExtensionAPI["appendEntry"] = () => undefined,
): Promise<LoadedRtk> {
  vi.resetModules();

  const { default: rtk } = await import("../index.js");
  let commandOptions: RegisteredCommandOptions | undefined;
  let sessionStart: SessionStartHandler | undefined;
  let userBash: undefined | UserBashHandler;

  function on(
    ...[event, handler]:
      ["session_start", SessionStartHandler] | ["user_bash", UserBashHandler]
  ): () => void {
    if (event === "session_start") sessionStart = handler;
    else userBash = handler;

    return () => undefined;
  }

  const pi: Pick<
    ExtensionAPI,
    "appendEntry" | "registerCommand" | "registerEntryRenderer" | "registerTool"
  > & { on: typeof on } = {
    appendEntry,
    on,
    registerCommand: (_name, options) => {
      commandOptions = options;
    },
    registerEntryRenderer: () => undefined,
    registerTool: () => undefined,
  };

  rtk(pi as ExtensionAPI);

  if (!commandOptions || !sessionStart || !userBash) {
    throw new Error("RTK did not register its command and handlers.");
  }

  return {
    command: commandOptions.handler,
    commandOptions,
    sessionStart,
    userBash,
  };
}

function makeContext(
  mode: ExtensionContext["mode"] = "tui",
  overrides: Partial<FakeUi> = {},
): FakeContext {
  const notify = vi.fn();
  const setStatus = vi.fn();
  const ui: FakeUi = {
    notify,
    select: () => Promise.resolve(undefined),
    setStatus,
    theme: createMarkerTheme(),
    ...overrides,
  };
  const ctx: Pick<ExtensionContext, "hasUI" | "mode"> & { ui: FakeUi } = {
    hasUI: mode === "tui" || mode === "rpc",
    mode,
    ui,
  };

  return { ctx: ctx as ExtensionCommandContext, notify, setStatus };
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
  mocks.spawnSync.mockReset();
  mocks.spawnSync.mockReturnValue(RTK_WORKS);
});

describe("footer badge", () => {
  it("shows a dim on badge when rewriting is enabled and rtk runs", async () => {
    const { sessionStart } = await loadRtk();
    const { ctx, setStatus } = makeContext();

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);

    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: on</dim>");
  });

  it("shows a warning badge when rtk is missing at session start", async () => {
    mocks.spawnSync.mockReturnValue(RTK_MISSING);

    const { sessionStart } = await loadRtk();
    const { ctx, setStatus } = makeContext();

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);

    expect(setStatus).toHaveBeenLastCalledWith(
      "rtk",
      "<warning>RTK: unavailable</warning>",
    );
  });

  it("shows a dim off badge after /rtk disable, even when rtk is missing", async () => {
    mocks.spawnSync.mockReturnValue(RTK_MISSING);

    const { command, sessionStart } = await loadRtk();
    const { ctx, setStatus } = makeContext();

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);
    await command("disable", ctx);

    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: off</dim>");

    await command("enable", ctx);

    expect(setStatus).toHaveBeenLastCalledWith(
      "rtk",
      "<warning>RTK: unavailable</warning>",
    );
  });

  it("keeps rewriting off across a session switch", async () => {
    const { command, sessionStart, userBash } = await loadRtk();
    const { ctx, setStatus } = makeContext();

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);
    await command("disable", ctx);
    await sessionStart({ reason: "new", type: "session_start" }, ctx);

    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: off</dim>");

    mocks.spawnSync.mockClear();
    await userBash(userBashEvent("git status"), ctx);

    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });

  it("follows rtk availability detected by later rewrites", async () => {
    const { sessionStart, userBash } = await loadRtk();
    const { ctx, setStatus } = makeContext();

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);
    mocks.spawnSync.mockReturnValue(RTK_MISSING);
    await userBash(userBashEvent("git status"), ctx);

    expect(setStatus).toHaveBeenLastCalledWith(
      "rtk",
      "<warning>RTK: unavailable</warning>",
    );

    mocks.spawnSync.mockReturnValue({
      error: undefined,
      stdout: "rtk git status\n",
    });
    await userBash(userBashEvent("git status"), ctx);

    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: on</dim>");
  });
});

describe("/rtk command", () => {
  it("runs the subcommand whose description the user picks from bare /rtk", async () => {
    const select = vi.fn((_title: string, options: string[]) =>
      Promise.resolve(options[1]),
    );
    const { command, sessionStart } = await loadRtk();
    const { ctx, notify, setStatus } = makeContext("tui", { select });

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);
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
    const { command, commandOptions, sessionStart, userBash } = await loadRtk(
      shown.appendEntry,
    );
    const ui = {
      notify: shown.notify,
      select: shown.select,
      setStatus: shown.setStatus,
      theme: createPlainTheme(),
    };
    const { ctx: tuiCtx } = makeContext("tui", ui);
    const { ctx: rpcCtx } = makeContext("rpc", ui);

    await shown.recordCommand(commandOptions);
    await sessionStart({ reason: "startup", type: "session_start" }, tuiCtx);
    await userBash(userBashEvent("git status"), tuiCtx);

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
