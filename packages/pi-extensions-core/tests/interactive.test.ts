/**
 * Covers the interactive-terminal gate for commands that open an overlay:
 * it passes in the TUI and warns once in every other run mode.
 */
import { requireInteractiveTui } from "../src/index.js";
import { describe, expect, it, vi } from "vitest";

describe("requireInteractiveTui", () => {
  it("returns true in the TUI without notifying", () => {
    const notify = vi.fn();

    expect(
      requireInteractiveTui({ mode: "tui", ui: { notify } }, "RTK", "/rtk"),
    ).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(["rpc", "json", "print"] as const)(
    "returns false in %s mode and notifies one warning",
    (mode) => {
      const notify = vi.fn();

      expect(
        requireInteractiveTui(
          { mode, ui: { notify } },
          "Session Slice",
          "/slice",
        ),
      ).toBe(false);

      expect(notify).toHaveBeenCalledExactlyOnceWith(
        "Session Slice: 1 warning\n- /slice needs Pi's interactive terminal UI. Run it from the TUI.",
        "warning",
      );
    },
  );
});
