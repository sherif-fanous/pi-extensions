import { renameConfigKeys } from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("renameConfigKeys", () => {
  it("moves a top-level key to its new name", () => {
    expect(
      renameConfigKeys({ isSyncActive: false, other: 1 }, [
        { from: "isSyncActive", to: "syncEnabled" },
      ]),
    ).toEqual({
      document: { other: 1, syncEnabled: false },
      renamed: ["isSyncActive"],
    });
  });

  it("moves a nested key within its object", () => {
    expect(
      renameConfigKeys({ toast: { position: "top", timeout: 5000 } }, [
        { from: "toast.timeout", to: "toast.timeoutMs" },
      ]).document,
    ).toEqual({ toast: { position: "top", timeoutMs: 5000 } });
  });

  it("creates the objects on the way to a new nested path", () => {
    expect(
      renameConfigKeys({ maxToastsVisible: 3 }, [
        { from: "maxToastsVisible", to: "toast.maxVisible" },
      ]),
    ).toEqual({
      document: { toast: { maxVisible: 3 } },
      renamed: ["maxToastsVisible"],
    });
  });

  it("keeps the new key and drops the old one when both are present", () => {
    expect(
      renameConfigKeys({ isSyncActive: false, syncEnabled: true }, [
        { from: "isSyncActive", to: "syncEnabled" },
      ]),
    ).toEqual({ document: { syncEnabled: true }, renamed: ["isSyncActive"] });
  });

  it("skips a rename whose old key is absent", () => {
    expect(
      renameConfigKeys({ syncEnabled: true }, [
        { from: "isSyncActive", to: "syncEnabled" },
        { from: "toast.timeout", to: "toast.timeoutMs" },
      ]),
    ).toEqual({ document: { syncEnabled: true }, renamed: [] });
  });

  it("leaves the old key when the new path runs through a non-object", () => {
    expect(
      renameConfigKeys({ maxToastsVisible: 3, toast: 5 }, [
        { from: "maxToastsVisible", to: "toast.maxVisible" },
      ]),
    ).toEqual({ document: { maxToastsVisible: 3, toast: 5 }, renamed: [] });
  });

  it("does not change the document it was given", () => {
    const document = { toast: { timeout: 5000 } };

    renameConfigKeys(document, [
      { from: "toast.timeout", to: "toast.timeoutMs" },
    ]);

    expect(document).toEqual({ toast: { timeout: 5000 } });
  });
});
