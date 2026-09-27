/** Covers the `pi-rtk` footer badge: toggle state and rtk binary availability. */

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
import { createMarkerTheme } from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawnSync: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: mocks.spawnSync,
}));

interface FakeContext {
  readonly ctx: ExtensionCommandContext;
  readonly setStatus: ReturnType<typeof vi.fn>;
}

interface LoadedRtk {
  readonly command: CommandHandler;
  readonly sessionStart: SessionStartHandler;
  readonly userBash: UserBashHandler;
}

type CommandHandler = RegisteredCommand["handler"];
type SessionStartHandler = ExtensionHandler<SessionStartEvent>;
type UserBashHandler = ExtensionHandler<UserBashEvent, UserBashEventResult>;

const RTK_MISSING = {
  error: Object.assign(new Error("spawnSync rtk ENOENT"), { code: "ENOENT" }),
  stdout: "",
};
const RTK_WORKS = { error: undefined, stdout: "rtk 0.30.0\n" };

/** Load a fresh copy of the extension, since its toggle is module state. */
async function loadRtk(): Promise<LoadedRtk> {
  vi.resetModules();

  const { default: rtk } = await import("../index.js");
  let command: CommandHandler | undefined;
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
    "registerCommand" | "registerEntryRenderer" | "registerTool"
  > & { on: typeof on } = {
    on,
    registerCommand: (_name, options) => {
      command = options.handler;
    },
    registerEntryRenderer: () => undefined,
    registerTool: () => undefined,
  };

  rtk(pi as ExtensionAPI);

  if (!command || !sessionStart || !userBash) {
    throw new Error("pi-rtk did not register its command and handlers.");
  }

  return { command, sessionStart, userBash };
}

function makeContext(): FakeContext {
  const setStatus = vi.fn();
  const ui: Pick<ExtensionUIContext, "notify" | "setStatus" | "theme"> = {
    notify: vi.fn(),
    setStatus,
    theme: createMarkerTheme(),
  };
  const ctx: Pick<ExtensionContext, "mode"> & { ui: typeof ui } = {
    mode: "tui",
    ui,
  };

  return { ctx: ctx as ExtensionCommandContext, setStatus };
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

    expect(setStatus).toHaveBeenLastCalledWith("pi-rtk", "<dim>RTK: on</dim>");
  });

  it("shows a warning badge when rtk is missing at session start", async () => {
    mocks.spawnSync.mockReturnValue(RTK_MISSING);

    const { sessionStart } = await loadRtk();
    const { ctx, setStatus } = makeContext();

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);

    expect(setStatus).toHaveBeenLastCalledWith(
      "pi-rtk",
      "<warning>RTK: unavailable</warning>",
    );
  });

  it("shows a dim off badge after /rtk disable, even when rtk is missing", async () => {
    mocks.spawnSync.mockReturnValue(RTK_MISSING);

    const { command, sessionStart } = await loadRtk();
    const { ctx, setStatus } = makeContext();

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);
    await command("disable", ctx);

    expect(setStatus).toHaveBeenLastCalledWith("pi-rtk", "<dim>RTK: off</dim>");

    await command("enable", ctx);

    expect(setStatus).toHaveBeenLastCalledWith(
      "pi-rtk",
      "<warning>RTK: unavailable</warning>",
    );
  });

  it("follows rtk availability detected by later rewrites", async () => {
    const { sessionStart, userBash } = await loadRtk();
    const { ctx, setStatus } = makeContext();

    await sessionStart({ reason: "startup", type: "session_start" }, ctx);
    mocks.spawnSync.mockReturnValue(RTK_MISSING);
    await userBash(userBashEvent("git status"), ctx);

    expect(setStatus).toHaveBeenLastCalledWith(
      "pi-rtk",
      "<warning>RTK: unavailable</warning>",
    );

    mocks.spawnSync.mockReturnValue({
      error: undefined,
      stdout: "rtk git status\n",
    });
    await userBash(userBashEvent("git status"), ctx);

    expect(setStatus).toHaveBeenLastCalledWith("pi-rtk", "<dim>RTK: on</dim>");
  });
});
