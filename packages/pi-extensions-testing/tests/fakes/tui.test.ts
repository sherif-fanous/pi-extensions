import { createFakeKeybindings, createPiKeybindings } from "../../src/index.js";
import { describe, expect, it } from "vitest";

describe("createPiKeybindings", () => {
  it("binds Pi's default keys", () => {
    const keybindings = createPiKeybindings();

    expect(keybindings.getKeys("tui.select.cancel")).toEqual([
      "escape",
      "ctrl+c",
    ]);
    expect(keybindings.matches("\u001B", "tui.select.cancel")).toBe(true);
  });

  it("replaces a binding's default keys with the user's", () => {
    const keybindings = createPiKeybindings({ "tui.select.cancel": "q" });

    expect(keybindings.getKeys("tui.select.cancel")).toEqual(["q"]);
    expect(keybindings.matches("q", "tui.select.cancel")).toBe(true);
    expect(keybindings.matches("\u001B", "tui.select.cancel")).toBe(false);
  });
});

describe("createFakeKeybindings", () => {
  it("matches the literal key names it was given", () => {
    const keybindings = createFakeKeybindings({ "tui.select.up": "UP" });

    expect(keybindings.matches("UP", "tui.select.up")).toBe(true);
    expect(keybindings.matches("DOWN", "tui.select.up")).toBe(false);
  });

  it("reports Pi's default keys so key hints render", () => {
    const keybindings = createFakeKeybindings({ "tui.select.up": "UP" });

    expect(keybindings.getKeys("tui.select.pageDown")).toEqual(["pageDown"]);
  });
});
