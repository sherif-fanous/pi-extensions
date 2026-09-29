/**
 * Covers extension scaffolding: the command and event guards' error text
 * and pass-through, warning notifications, the usage-mistake warning, and
 * first-word subcommand completions.
 */
import {
  guardCommand,
  notifyUsageWarning,
  notifyWarnings,
  onEvent,
  subcommandCompletions,
  type GuardContext,
} from "../../src/index.js";
import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakePi,
} from "@sherif-fanous/pi-extensions-testing";
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

    const fake = createFakePi();

    onEvent(fake.pi, "RTK", "session_start", () => {
      throw new Error("boom");
    });

    await expect(
      fake.emit(
        { reason: "startup", type: "session_start" },
        createFakeContext({ ui: ctx.ui }),
      ),
    ).resolves.toEqual([undefined]);
  });
});

describe("onEvent", () => {
  const event = {
    systemPrompt: "base",
    type: "before_agent_start",
  } as BeforeAgentStartEvent;

  it("registers the handler for the event and passes its result through", async () => {
    const { ctx, notify } = notifyingContext();
    const fake = createFakePi();

    onEvent(fake.pi, "Presets Plus", "before_agent_start", (received) => ({
      systemPrompt: `${received.systemPrompt}\n\nextra`,
    }));

    expect([...fake.handlers.keys()]).toEqual(["before_agent_start"]);
    await expect(
      fake.emit(event, createFakeContext({ ui: ctx.ui })),
    ).resolves.toEqual([{ systemPrompt: "base\n\nextra" }]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies a failure named after the event and returns undefined", async () => {
    const { ctx, notify } = notifyingContext();
    const fake = createFakePi();

    onEvent(fake.pi, "Presets Plus", "before_agent_start", () =>
      Promise.reject(new Error("Disk full!")),
    );

    await expect(
      fake.emit(event, createFakeContext({ ui: ctx.ui })),
    ).resolves.toEqual([undefined]);

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

describe("notifyUsageWarning", () => {
  it.each([
    [["/notifications"], "Try /notifications."],
    [
      ["/theme-sync", "/theme-sync status"],
      "Try /theme-sync or /theme-sync status.",
    ],
    [
      ["/rtk", "/rtk enable", "/rtk disable", "/rtk status"],
      "Try /rtk, /rtk enable, /rtk disable, or /rtk status.",
    ],
  ] as const)("lists the forms %j as alternatives", (forms, suggestion) => {
    const { ctx, notify } = notifyingContext();

    notifyUsageWarning(ctx, "RTK", " foo bar ", forms);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      `RTK: 1 warning\n- Unknown subcommand "foo bar". ${suggestion}`,
      "warning",
    );
  });
});

describe("subcommandCompletions", () => {
  const complete = subcommandCompletions([
    { description: "Show status", name: "status" },
    { name: "enable" },
  ]);

  it("completes the first word by prefix, ignoring leading whitespace", () => {
    expect(complete("  st")).toEqual([
      { description: "Show status", label: "status", value: "status" },
    ]);
  });

  it("omits the description of a subcommand without one", () => {
    expect(complete("en")).toStrictEqual([
      { label: "enable", value: "enable" },
    ]);
  });

  it("returns null once the argument contains a space", () => {
    expect(complete("status ")).toBeNull();
  });

  it("returns null when no subcommand matches", () => {
    expect(complete("other")).toBeNull();
  });
});
