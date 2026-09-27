/**
 * Covers extension scaffolding: the command and event guards' error text
 * and pass-through, warning notifications, and first-word subcommand
 * completions.
 */
import {
  guardCommand,
  guardEvent,
  notifyWarnings,
  subcommandCompletions,
  type GuardContext,
} from "../src/index.js";
import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

function notifyingContext(): {
  ctx: GuardContext;
  notify: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();

  return { ctx: { ui: { notify } }, notify };
}

describe("guardCommand", () => {
  it.each([
    ["disk full", "Presets Plus command failed: disk full."],
    ["Disk full.", "Presets Plus command failed: Disk full."],
  ])(
    "notifies a rejection of %j with exactly one terminator",
    async (message, expected) => {
      const { ctx, notify } = notifyingContext();
      const handler = guardCommand("Presets Plus", () =>
        Promise.reject(new Error(message)),
      );

      await expect(handler("", ctx)).resolves.toBeUndefined();
      expect(notify).toHaveBeenCalledExactlyOnceWith(expected, "error");
    },
  );

  it("notifies a synchronous throw instead of rethrowing it", async () => {
    const { ctx, notify } = notifyingContext();
    const handler = guardCommand("RTK", () => {
      throw new Error("spawn failed");
    });

    await expect(handler("status", ctx)).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "RTK command failed: spawn failed.",
      "error",
    );
  });
});

describe("guard reporting through a stale context", () => {
  it("resolves when notify itself throws", async () => {
    const ctx: GuardContext = {
      ui: {
        notify: () => {
          throw new Error("stale context");
        },
      },
    };

    await expect(
      guardCommand("RTK", () => Promise.reject(new Error("boom")))("", ctx),
    ).resolves.toBeUndefined();

    await expect(
      guardEvent("RTK", "user_bash", () => {
        throw new Error("boom");
      })({}, ctx),
    ).resolves.toBeUndefined();
  });
});

describe("guardEvent", () => {
  const event = { systemPrompt: "base" } as BeforeAgentStartEvent;

  it("passes the handler result through when it succeeds", async () => {
    const { ctx, notify } = notifyingContext();
    const handler = guardEvent(
      "Presets Plus",
      "before_agent_start",
      (received: BeforeAgentStartEvent): BeforeAgentStartEventResult => ({
        systemPrompt: `${received.systemPrompt}\n\nextra`,
      }),
    );

    await expect(handler(event, ctx)).resolves.toEqual({
      systemPrompt: "base\n\nextra",
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies a failure and returns undefined", async () => {
    const { ctx, notify } = notifyingContext();
    const handler = guardEvent(
      "Presets Plus",
      "before_agent_start",
      (): Promise<BeforeAgentStartEventResult> =>
        Promise.reject(new Error("Disk full!")),
    );

    await expect(handler(event, ctx)).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Presets Plus before_agent_start failed: Disk full!",
      "error",
    );
  });
});

describe("notifyWarnings", () => {
  it("does not notify when there are no warnings", () => {
    const { ctx, notify } = notifyingContext();

    notifyWarnings(ctx, "Theme Sync", []);

    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies one warning under a singular heading", () => {
    const { ctx, notify } = notifyingContext();

    notifyWarnings(ctx, "Theme Sync", ["Configuration is not valid JSON."]);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Theme Sync: 1 warning\n- Configuration is not valid JSON.",
      "warning",
    );
  });

  it("notifies several warnings once, under a plural heading, in order", () => {
    const { ctx, notify } = notifyingContext();

    notifyWarnings(ctx, "Presets Plus", ["First.", "Second.", "Third."]);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Presets Plus: 3 warnings\n- First.\n- Second.\n- Third.",
      "warning",
    );
  });

  it("does not throw when notify itself throws", () => {
    const ctx: GuardContext = {
      ui: {
        notify: () => {
          throw new Error("stale context");
        },
      },
    };

    expect(() => notifyWarnings(ctx, "RTK", ["Broken."])).not.toThrow();
  });
});

describe("subcommandCompletions", () => {
  const complete = subcommandCompletions([
    { description: "show status", name: "status" },
    { name: "enable" },
  ]);

  it("completes the first word by prefix, ignoring leading whitespace", () => {
    expect(complete("  st")).toEqual([
      { label: "status: show status", value: "status" },
    ]);
  });

  it("labels a subcommand without a description by its name", () => {
    expect(complete("en")).toEqual([{ label: "enable", value: "enable" }]);
  });

  it("returns null once the argument contains a space", () => {
    expect(complete("status ")).toBeNull();
  });

  it("returns null when no subcommand matches", () => {
    expect(complete("other")).toBeNull();
  });
});
