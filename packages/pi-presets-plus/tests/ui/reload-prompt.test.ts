/**
 * Covers the reload confirmation asked for after a save: the answer it
 * returns, the skip when the host offers no reload, and the deferred reload
 * that reports its own failure.
 */
import {
  confirmReload,
  reloadAfterOverlayClose,
} from "../../src/ui/reload-prompt.js";
import { createFakeCustom } from "@sherif-fanous/pi-extensions-testing";
import { afterEach, describe, expect, it, vi } from "vitest";

interface TestContext {
  readonly custom: ReturnType<typeof vi.fn>;
  readonly notify: ReturnType<typeof vi.fn>;
  readonly reload?: ReturnType<typeof vi.fn>;
}

/** Builds an extension context whose overlay answers the prompt as the user. */
function makeCtx(options: {
  readonly answer?: "yes" | "no";
  readonly reload?: ReturnType<typeof vi.fn>;
}): TestContext & Parameters<typeof confirmReload>[0] {
  const notify = vi.fn();
  const custom = vi.fn(
    createFakeCustom({ keys: [options.answer === "yes" ? "y" : "n"] }),
  );

  return {
    custom,
    notify,
    reload: options.reload,
    ui: { custom, notify },
  } as unknown as TestContext & Parameters<typeof confirmReload>[0];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("confirmReload", () => {
  it("returns the user's reload choice without reloading immediately", async () => {
    const reload = vi.fn();
    const ctx = makeCtx({ answer: "yes", reload });

    await expect(confirmReload(ctx)).resolves.toBe(true);

    expect(ctx.custom).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it("skips the prompt when reload is unavailable", async () => {
    const ctx = makeCtx({ answer: "yes", reload: undefined });

    await expect(confirmReload(ctx)).resolves.toBe(false);

    expect(ctx.custom).not.toHaveBeenCalled();
    expect(ctx.notify).not.toHaveBeenCalled();
  });
});

describe("reloadAfterOverlayClose", () => {
  it("notifies and swallows reload failures after overlays can close", async () => {
    vi.useFakeTimers();

    const reload = vi.fn().mockRejectedValue(new Error("boom"));
    const ctx = makeCtx({ answer: "yes", reload });

    reloadAfterOverlayClose(ctx);
    expect(reload).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(reload).toHaveBeenCalledOnce();
    expect(ctx.notify).toHaveBeenCalledWith(
      "Failed to reload Pi: boom.",
      "error",
    );
  });
});
