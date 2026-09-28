/** Covers how the fake handler context merges the members a test sets. */

import { createFakeContext } from "../../src/index.js";
import { describe, expect, it } from "vitest";

describe("createFakeContext", () => {
  it("keeps the other session manager and ui members when one is replaced", () => {
    const ctx = createFakeContext({
      mode: "print",
      sessionManager: { getSessionFile: () => "/sessions/a.jsonl" },
      ui: { getEditorText: () => "draft" },
    });

    expect(ctx.hasUI).toBe(false);
    expect(ctx.sessionManager.getSessionFile()).toBe("/sessions/a.jsonl");
    expect(ctx.sessionManager.getBranch()).toEqual([]);
    expect(ctx.ui.getEditorText()).toBe("draft");
    expect(ctx.ui.theme.fg("accent", "text")).toBe("text");
  });
});
