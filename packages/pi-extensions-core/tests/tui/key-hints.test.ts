import {
  formatKeyId,
  keyHint,
  keyText,
  matchesHelpKey,
  matchSelectAction,
  wrapKeyHints,
} from "../../src/index.js";
import { Key } from "@earendil-works/pi-tui";
import {
  createPiKeybindings,
  findOverflowingLines,
  stripAnsi,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

describe("formatKeyId", () => {
  it("spells named keys the way hints show them", () => {
    expect(formatKeyId(Key.up)).toBe("↑");
    expect(formatKeyId(Key.down)).toBe("↓");
    expect(formatKeyId(Key.left)).toBe("←");
    expect(formatKeyId(Key.right)).toBe("→");
    expect(formatKeyId(Key.escape)).toBe("Esc");
    expect(formatKeyId(Key.enter)).toBe("Enter");
    expect(formatKeyId(Key.pageUp)).toBe("PgUp");
    expect(formatKeyId(Key.pageDown)).toBe("PgDn");
    expect(formatKeyId(Key.tab)).toBe("Tab");
    expect(formatKeyId(Key.space)).toBe("Space");
    expect(formatKeyId(Key.f1)).toBe("F1");
  });

  it("joins modifiers with + and upper-cases a letter after one", () => {
    expect(formatKeyId(Key.ctrl("s"))).toBe("Ctrl+S");
    expect(formatKeyId(Key.shift("tab"))).toBe("Shift+Tab");
    expect(formatKeyId(Key.ctrl("up"))).toBe("Ctrl+↑");
  });

  it("keeps a bare printable key as typed", () => {
    expect(formatKeyId("n")).toBe("n");
    expect(formatKeyId("/")).toBe("/");
  });
});

describe("keyText", () => {
  it("shows the first key bound by default", () => {
    const keybindings = createPiKeybindings();

    expect(keyText(keybindings, "tui.select.cancel")).toBe("Esc");
    expect(keyText(keybindings, "tui.select.confirm")).toBe("Enter");
  });

  it("follows a remap", () => {
    const keybindings = createPiKeybindings({
      "tui.select.cancel": ["ctrl+q", "escape"],
    });

    expect(keyText(keybindings, "tui.select.cancel")).toBe("Ctrl+Q");
  });

  it("returns undefined for a binding with no key", () => {
    const keybindings = createPiKeybindings({ "tui.select.pageUp": [] });

    expect(keyText(keybindings, "tui.select.pageUp")).toBeUndefined();
  });
});

describe("keyHint", () => {
  it("pairs the bound keys with a Title Case action", () => {
    const keybindings = createPiKeybindings();

    expect(
      keyHint(keybindings, ["tui.select.up", "tui.select.down"], "Move"),
    ).toBe("↑/↓ Move");

    expect(keyHint(keybindings, "tui.select.cancel", "Close")).toBe(
      "Esc Close",
    );
  });

  it("names the remapped key instead of the default", () => {
    const keybindings = createPiKeybindings({
      "tui.select.down": "j",
      "tui.select.up": "k",
    });

    expect(
      keyHint(keybindings, ["tui.select.up", "tui.select.down"], "Move"),
    ).toBe("k/j Move");
  });

  it("leaves out unbound keys, and the hint when none is bound", () => {
    const keybindings = createPiKeybindings({
      "tui.select.pageDown": [],
      "tui.select.pageUp": [],
      "tui.select.up": [],
    });

    expect(
      keyHint(keybindings, ["tui.select.up", "tui.select.down"], "Move"),
    ).toBe("↓ Move");

    expect(
      keyHint(
        keybindings,
        ["tui.select.pageUp", "tui.select.pageDown"],
        "Page",
      ),
    ).toBeUndefined();
  });
});

describe("matchesHelpKey", () => {
  it("matches the legacy F1 encodings", () => {
    for (const data of ["\u001BOP", "\u001B[11~", "\u001B[[A"]) {
      expect(matchesHelpKey(data)).toBe(true);
    }
  });

  it("matches the Kitty F1 presses that matchesKey misses", () => {
    // Ghostty sends the SS3 form with event subfields; the Kitty protocol
    // also has a codepoint form.
    for (const data of [
      "\u001B[1P",
      "\u001B[1;1P",
      "\u001B[1;1:1P",
      "\u001B[57364u",
      "\u001B[57364;1u",
      "\u001B[57364;1:1u",
    ]) {
      expect(matchesHelpKey(data)).toBe(true);
    }
  });

  it("ignores F1 releases, modified F1, and other keys", () => {
    for (const data of [
      "\u001B[1;1:3P",
      "\u001B[57364;1:3u",
      "\u001B[1;5P",
      "\u001B[57365u",
      "\u001B",
      "p",
    ]) {
      expect(matchesHelpKey(data)).toBe(false);
    }
  });
});

describe("matchSelectAction", () => {
  it("matches Pi's default select keys, including Ctrl+C to cancel", () => {
    const keybindings = createPiKeybindings();

    expect(matchSelectAction(keybindings, "\u001B[A")).toBe("up");
    expect(matchSelectAction(keybindings, "\u001B[B")).toBe("down");
    expect(matchSelectAction(keybindings, "\u001B[5~")).toBe("pageUp");
    expect(matchSelectAction(keybindings, "\u001B[6~")).toBe("pageDown");
    expect(matchSelectAction(keybindings, "\r")).toBe("confirm");
    expect(matchSelectAction(keybindings, "\u001B")).toBe("cancel");
    expect(matchSelectAction(keybindings, "\u0003")).toBe("cancel");
    expect(matchSelectAction(keybindings, "x")).toBeUndefined();
  });

  it("replaces the default keys with a remap instead of adding to them", () => {
    const keybindings = createPiKeybindings({ "tui.select.cancel": "q" });

    expect(matchSelectAction(keybindings, "q")).toBe("cancel");
    expect(matchSelectAction(keybindings, "\u001B")).toBeUndefined();
    expect(matchSelectAction(keybindings, "\u0003")).toBeUndefined();
  });
});

describe("wrapKeyHints", () => {
  const hints = [
    "↑/↓ Move",
    "PgUp/PgDn Page",
    "Enter Select",
    "F1 Help",
    "Esc Close",
  ];

  it("joins hints with a middle dot on one line when they fit", () => {
    expect(wrapKeyHints(hints, 80)).toEqual([
      "↑/↓ Move · PgUp/PgDn Page · Enter Select · F1 Help · Esc Close",
    ]);
  });

  it("wraps between hints instead of cutting one", () => {
    expect(wrapKeyHints(hints, 30)).toEqual([
      "↑/↓ Move · PgUp/PgDn Page",
      "Enter Select · F1 Help",
      "Esc Close",
    ]);
  });

  it("skips undefined and empty hints", () => {
    expect(wrapKeyHints(["↑/↓ Move", undefined, "", "Esc Close"], 40)).toEqual([
      "↑/↓ Move · Esc Close",
    ]);
  });

  it("truncates only a hint wider than a whole line", () => {
    expect(
      wrapKeyHints(["Esc Close", "Enter Select"], 8).map((line) =>
        stripAnsi(line),
      ),
    ).toEqual(["Esc Clo…", "Enter S…"]);
  });

  it("fits every line at narrow widths", () => {
    for (const width of [40, 20, 10, 1]) {
      expect(findOverflowingLines(wrapKeyHints(hints, width), width)).toEqual(
        [],
      );
    }
  });
});
