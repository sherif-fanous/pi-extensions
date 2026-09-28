/**
 * Covers RTK's runtime with a fake spawn: the footer badge (toggle state and
 * rtk binary availability), rewriting, and the warning when rtk can't run,
 * given once per outage.
 */

import type { RtkRuntime, RtkSpawn } from "../src/runtime.js";
import {
  createFakeContext,
  createMarkerTheme,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

interface FakeContext {
  readonly ctx: ReturnType<typeof createFakeContext>;
  readonly notify: ReturnType<typeof vi.fn>;
  readonly setStatus: ReturnType<typeof vi.fn>;
}

const RTK_MISSING = {
  error: Object.assign(new Error("spawnSync rtk ENOENT"), { code: "ENOENT" }),
  stdout: "",
};
const RTK_NOT_EXECUTABLE = {
  error: Object.assign(new Error("spawnSync rtk EACCES"), { code: "EACCES" }),
  stdout: "",
};
const RTK_REWRITES = { stdout: "rtk git status\n" };
const RTK_WORKS = { stdout: "rtk 0.30.0\n" };
const MISSING_WARNING = expect.stringContaining(
  "The rtk binary was not found on PATH.",
) as unknown;

let createRuntime: () => RtkRuntime;
let spawn: Mock<RtkSpawn>;

function makeContext(): FakeContext {
  const notify = vi.fn();
  const setStatus = vi.fn();
  const ctx = createFakeContext({
    ui: { notify, setStatus, theme: createMarkerTheme() },
  });

  return { ctx, notify, setStatus };
}

// A fresh module per test, as a Pi restart or `/reload` gives, since the
// toggle and the rtk availability are module state.
beforeEach(async () => {
  vi.resetModules();

  const { createRtkRuntime } = await import("../src/runtime.js");

  spawn = vi.fn<RtkSpawn>(() => RTK_WORKS);
  createRuntime = () => createRtkRuntime({ spawn });
});

describe("footer badge", () => {
  it("shows a dim on badge when rewriting is enabled and rtk runs", () => {
    const { ctx, setStatus } = makeContext();

    createRuntime().startSession(ctx);

    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: on</dim>");
  });

  it("shows a warning badge when rtk is missing at session start", () => {
    spawn.mockReturnValue(RTK_MISSING);

    const { ctx, setStatus } = makeContext();

    createRuntime().startSession(ctx);

    expect(setStatus).toHaveBeenLastCalledWith(
      "rtk",
      "<warning>RTK: unavailable</warning>",
    );
  });

  it("shows a dim off badge while rewriting is off, even when rtk is missing", () => {
    spawn.mockReturnValue(RTK_MISSING);

    const runtime = createRuntime();
    const { ctx, setStatus } = makeContext();

    runtime.startSession(ctx);
    runtime.setSessionEnabled(false, ctx);

    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: off</dim>");

    runtime.setSessionEnabled(true, ctx);

    expect(setStatus).toHaveBeenLastCalledWith(
      "rtk",
      "<warning>RTK: unavailable</warning>",
    );
  });

  it("keeps rewriting off in the runtime of the next session", () => {
    const first = createRuntime();
    const { ctx } = makeContext();

    first.startSession(ctx);
    first.setSessionEnabled(false, ctx);

    const second = createRuntime();
    const { ctx: newCtx, setStatus } = makeContext();

    second.startSession(newCtx);

    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: off</dim>");

    spawn.mockClear();

    expect(second.rewriteIfEnabled("git status")).toBeUndefined();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("follows rtk availability detected by later rewrites", () => {
    const runtime = createRuntime();
    const { ctx, setStatus } = makeContext();

    runtime.startSession(ctx);
    spawn.mockReturnValue(RTK_MISSING);
    runtime.rewriteIfEnabled("git status");

    expect(setStatus).toHaveBeenLastCalledWith(
      "rtk",
      "<warning>RTK: unavailable</warning>",
    );

    spawn.mockReturnValue(RTK_REWRITES);
    runtime.rewriteIfEnabled("git status");

    expect(setStatus).toHaveBeenLastCalledWith("rtk", "<dim>RTK: on</dim>");
  });
});

describe("rewriting", () => {
  it("returns rtk's rewrite of the command", () => {
    const runtime = createRuntime();

    spawn.mockReturnValue(RTK_REWRITES);

    expect(runtime.rewriteIfEnabled("git status")).toBe("rtk git status");
    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      "rtk",
      ["rewrite", "git status"],
      expect.anything(),
    );
  });

  it.each([
    ["rtk has no rewrite for it", { stdout: "" }],
    [
      "rtk times out",
      {
        error: Object.assign(new Error("spawnSync rtk ETIMEDOUT"), {
          code: "ETIMEDOUT",
        }),
        stdout: "",
      },
    ],
  ])("returns no rewrite, silently, when %s", (_case, rewrite) => {
    const runtime = createRuntime();
    const { ctx, notify } = makeContext();

    runtime.startSession(ctx);
    spawn.mockReturnValue(rewrite);

    expect(runtime.rewriteIfEnabled("git status")).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("rtk unavailable warning", () => {
  it("says so when rtk is on PATH but not executable", () => {
    spawn.mockReturnValue(RTK_NOT_EXECUTABLE);

    const { ctx, notify } = makeContext();

    createRuntime().startSession(ctx);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("The rtk binary on PATH is not executable."),
      "warning",
    );
  });

  it("warns in the new session after a session switch, not the old one", () => {
    const old = makeContext();

    createRuntime().startSession(old.ctx);

    const current = makeContext();

    spawn.mockReturnValue(RTK_MISSING);
    createRuntime().startSession(current.ctx);

    expect(old.notify).not.toHaveBeenCalled();
    expect(current.notify).toHaveBeenCalledExactlyOnceWith(
      MISSING_WARNING,
      "warning",
    );
  });

  it("does not warn again while the outage lasts", () => {
    spawn.mockReturnValue(RTK_MISSING);

    const runtime = createRuntime();
    const { ctx, notify } = makeContext();

    runtime.startSession(ctx);
    runtime.rewriteIfEnabled("git status");
    runtime.rewriteIfEnabled("git log");

    expect(notify).toHaveBeenCalledExactlyOnceWith(MISSING_WARNING, "warning");
  });

  it("warns again for a second outage after a rewrite succeeds", () => {
    spawn.mockReturnValue(RTK_MISSING);

    const runtime = createRuntime();
    const { ctx, notify } = makeContext();

    runtime.startSession(ctx);
    spawn.mockReturnValue(RTK_REWRITES);
    runtime.rewriteIfEnabled("git status");
    spawn.mockReturnValue(RTK_MISSING);
    runtime.rewriteIfEnabled("git status");

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith(MISSING_WARNING, "warning");
  });

  it("warns again for a second outage after the status report finds rtk", () => {
    spawn.mockReturnValue(RTK_MISSING);

    const runtime = createRuntime();
    const { ctx, notify } = makeContext();

    runtime.startSession(ctx);
    spawn.mockReturnValue(RTK_WORKS);
    runtime.rtkStatusReport();
    spawn.mockReturnValue(RTK_MISSING);
    runtime.rewriteIfEnabled("git status");

    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("warns again when rtk is uninstalled after a new session found it installed", () => {
    spawn.mockReturnValue(RTK_MISSING);

    const startup = makeContext();

    createRuntime().startSession(startup.ctx);

    expect(startup.notify).toHaveBeenCalledExactlyOnceWith(
      MISSING_WARNING,
      "warning",
    );

    spawn.mockReturnValue(RTK_WORKS);

    const runtime = createRuntime();
    const current = makeContext();

    runtime.startSession(current.ctx);
    spawn.mockReturnValue(RTK_MISSING);

    expect(runtime.rewriteIfEnabled("git status")).toBeUndefined();
    expect(current.notify).toHaveBeenCalledExactlyOnceWith(
      MISSING_WARNING,
      "warning",
    );
  });
});
