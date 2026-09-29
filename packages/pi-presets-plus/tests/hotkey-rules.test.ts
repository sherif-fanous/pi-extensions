/**
 * Covers the hotkey rules: parsing and normalizing, Pi built-ins, which
 * preset owns a key across the merged list, change comparison, and the
 * warnings shown at startup and in the editor.
 */
import {
  analyzeHotkeys,
  diagnoseDraftHotkey,
  hotkeyChanged,
  type HotkeyDraft,
} from "../src/hotkey-rules.js";
import type { LoadedPreset } from "../src/types.js";
import { describe, expect, it } from "vitest";

/** Each binding as `<scope>:<name> <key>`. */
function boundKeys(presets: readonly LoadedPreset[]): string[] {
  return analyzeHotkeys(presets).bindings.map(
    ({ key, name, scope }) => `${scope}:${name} ${key}`,
  );
}

function preset(
  name: string,
  hotkey: string | undefined,
  scope: LoadedPreset["scope"] = "user",
  extra: Partial<LoadedPreset> = {},
): LoadedPreset {
  return {
    ...extra,
    hotkey,
    model: "claude-opus-4.5",
    name,
    provider: "anthropic",
    scope,
  };
}

/** A shadowed user preset, as the merge tags one named like a project preset. */
function shadowed(name: string, hotkey: string): LoadedPreset {
  return preset(name, hotkey, "user", { shadowed: true });
}

describe("parsing and normalizing", () => {
  it.each([
    ["Alt + CTRL + P", "ctrl+alt+p"],
    ["shift+ctrl+1", "ctrl+shift+1"],
    ["shift+f12", "shift+f12"],
    ["alt+enter", "alt+enter"],
    ["ctrl+return", "ctrl+enter"],
    ["ctrl+Escape", "ctrl+esc"],
    ["ctrl+PageDown", "ctrl+pageDown"],
    ["ctrl+/", "ctrl+/"],
  ])("binds %j as %j", (hotkey, key) => {
    expect(analyzeHotkeys([preset("plan", hotkey)]).bindings).toEqual([
      { key, name: "plan", scope: "user" },
    ]);
  });

  it.each([
    ["ctrl+ctrl+p", 'duplicate modifier "ctrl"'],
    ["ctrl+shift", "hotkey is missing a key"],
    ["ctrl+p+q", "hotkey must contain exactly one key"],
    ["+", "hotkey is empty"],
    ["ctrl+f13", 'unsupported key "f13"'],
  ])("rejects %j because %s", (hotkey, reason) => {
    expect(analyzeHotkeys([preset("plan", hotkey)]).bindings).toEqual([]);
    expect(
      diagnoseDraftHotkey({ hotkey, name: "plan", scope: "user" }, []),
    ).toEqual({ message: reason, severity: "error" });
  });

  it.each([undefined, ""])("ignores the hotkey %j", (hotkey) => {
    const analysis = analyzeHotkeys([preset("plan", hotkey)]);

    expect(analysis.bindings).toEqual([]);
    expect(analysis.warnings).toEqual([]);
  });
});

describe("Pi built-ins", () => {
  it.each([
    ["ctrl+l", "ctrl+l"],
    ["Shift+Ctrl+P", "ctrl+shift+p"],
    ["escape", "esc"],
    ["ctrl+alt+]", "ctrl+alt+]"],
  ])("recognizes %j", (hotkey, key) => {
    expect(
      diagnoseDraftHotkey({ hotkey, name: "plan", scope: "user" }, []),
    ).toEqual({
      message: `⚠ ${key} shadows a Pi built-in. Saving will replace Pi's behavior for this key.`,
      severity: "warning",
    });
  });

  it("does not flag an unrelated combination", () => {
    expect(
      diagnoseDraftHotkey(
        { hotkey: "ctrl+shift+1", name: "plan", scope: "user" },
        [],
      ),
    ).toBeUndefined();
  });

  it("annotates every parsed built-in, bound or not", () => {
    const annotated = analyzeHotkeys([
      preset("plan", "ctrl+l"),
      preset("review", "ctrl+l"),
      shadowed("ship", "ctrl+l"),
      preset("ship", "alt+s", "project"),
      preset("ordinary", "ctrl+shift+9"),
      preset("empty", undefined),
      preset("malformed", "ctrl+ctrl+l"),
    ]).presets.map((entry) => entry.hotkeyShadowsBuiltin);

    expect(annotated).toEqual([
      true,
      true,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe("ownership", () => {
  it.each<[string, LoadedPreset[], string[]]>([
    [
      "the earlier preset wins a normalized match",
      [preset("plan", "ctrl+shift+1"), preset("review", "Shift+Ctrl+1")],
      ["user:plan ctrl+shift+1"],
    ],
    [
      "a user preset wins over a later project preset",
      [preset("plan", "ctrl+m"), preset("review", "ctrl+m", "project")],
      ["user:plan ctrl+m"],
    ],
    [
      "a shadowed preset owns nothing",
      [shadowed("plan", "ctrl+m"), preset("plan", "ctrl+n", "project")],
      ["project:plan ctrl+n"],
    ],
    [
      "a shadowed preset leaves its key to a later preset",
      [
        shadowed("plan", "ctrl+m"),
        preset("review", "ctrl+m", "project"),
        preset("plan", undefined, "project"),
      ],
      ["project:review ctrl+m"],
    ],
    [
      "an invalid hotkey claims nothing",
      [preset("plan", "ctrl+ctrl+m"), preset("review", "ctrl+m")],
      ["user:review ctrl+m"],
    ],
  ])("%s", (_label, presets, expected) => {
    expect(boundKeys(presets)).toEqual(expected);
  });

  it("marks only the presets that lost a conflict", () => {
    const annotated = analyzeHotkeys([
      preset("plan", "ctrl+shift+1"),
      preset("review", "shift+ctrl+1", "project"),
      preset("ship", "alt+s"),
    ]).presets.map((entry) => entry.hotkeyConflict);

    expect(annotated).toEqual([undefined, true, undefined]);
  });

  it("recomputes stale annotations without changing its input", () => {
    const stale = preset("plan", "ctrl+shift+1", "user", {
      hotkeyConflict: true,
      hotkeyShadowsBuiltin: true,
    });
    const [annotated] = analyzeHotkeys([stale]).presets;

    expect(annotated).toMatchObject({
      hotkeyConflict: undefined,
      hotkeyShadowsBuiltin: undefined,
      name: "plan",
    });
    expect(stale.hotkeyConflict).toBe(true);
  });
});

describe("hotkeyChanged", () => {
  it.each([
    ["both empty", "", "", false],
    ["both undefined", undefined, undefined, false],
    ["one empty and one whitespace", "", "   ", false],
    ["same hotkey", "ctrl+1", "ctrl+1", false],
    ["equivalent casing", "Ctrl+P", "ctrl+p", false],
    ["equivalent modifier order", "shift+ctrl+1", "ctrl+shift+1", false],
    ["equivalent key names", "ctrl+return", "ctrl+enter", false],
    ["the same invalid text", " ctrl+ctrl+p ", "ctrl+ctrl+p", false],
    ["different invalid text", "Ctrl+Ctrl+P", "ctrl+ctrl+p", true],
    ["different hotkeys", "ctrl+1", "ctrl+2", true],
    ["a removed hotkey", "ctrl+1", "", true],
    ["an added hotkey", "", "ctrl+1", true],
  ])("compares %s", (_label, previous, next, expected) => {
    expect(hotkeyChanged(previous, next)).toBe(expected);
  });
});

describe("startup warnings", () => {
  it("words conflicts, then invalid hotkeys, then built-ins, in preset order", () => {
    expect(
      analyzeHotkeys([
        preset("plan", "ctrl+l"),
        preset("bad", "ctrl+ctrl+p"),
        preset("review", "Ctrl+L", "project"),
        preset("ship", "ctrl+k"),
        shadowed("draft", "ctrl+o"),
      ]).warnings,
    ).toEqual([
      'Preset "review" hotkey "Ctrl+L" conflicts with preset "plan" (user). The first registered wins.',
      'Preset "bad" has invalid hotkey "ctrl+ctrl+p" (duplicate modifier "ctrl"). Ignored it, so it is not registered or checked for conflicts until it is fixed.',
      'Preset "plan" hotkey "ctrl+l" shadows a Pi built-in. The preset binding will take precedence.',
      'Preset "ship" hotkey "ctrl+k" shadows a Pi built-in. The preset binding will take precedence.',
    ]);
  });

  it("warns about a whitespace-only hotkey as invalid", () => {
    expect(analyzeHotkeys([preset("plan", "  ")]).warnings).toEqual([
      'Preset "plan" has invalid hotkey "  " (hotkey is empty). Ignored it, so it is not registered or checked for conflicts until it is fixed.',
    ]);
  });
});

describe("diagnoseDraftHotkey", () => {
  const conflict = (name: string) => ({
    message: `⚠ ctrl+m is already used by preset "${name}". Pi will skip this preset's binding.`,
    severity: "warning",
  });

  it.each<
    [
      string,
      HotkeyDraft,
      LoadedPreset[],
      ReturnType<typeof conflict> | undefined,
    ]
  >([
    [
      "warns when an earlier preset owns the key",
      { hotkey: "ctrl+m", name: "plan", scope: "user" },
      [preset("review", "ctrl+m")],
      conflict("review"),
    ],
    [
      "does not warn when this preset wins over a later one",
      {
        hotkey: "ctrl+m",
        name: "plan",
        replaces: { name: "plan", scope: "user" },
        scope: "user",
      },
      [preset("plan", "ctrl+m"), preset("review", "ctrl+m", "project")],
      undefined,
    ],
    [
      "does not warn about a shadowed preset's key",
      { hotkey: "ctrl+m", name: "plan", scope: "project" },
      [shadowed("review", "ctrl+m"), preset("review", "ctrl+n", "project")],
      undefined,
    ],
    [
      "warns when this preset is shadowed by one that owns the key",
      {
        hotkey: "ctrl+m",
        name: "plan",
        replaces: { name: "plan", scope: "user" },
        scope: "user",
      },
      [shadowed("plan", "ctrl+m"), preset("plan", "ctrl+m", "project")],
      conflict("plan"),
    ],
    [
      "warns when moving this preset puts it after the owner",
      {
        hotkey: "ctrl+m",
        name: "plan",
        replaces: { name: "plan", scope: "user" },
        scope: "project",
      },
      [preset("plan", "ctrl+m"), preset("review", "ctrl+m")],
      conflict("review"),
    ],
    [
      "places a new user preset before every project preset",
      { hotkey: "ctrl+m", name: "plan", scope: "user" },
      [preset("review", "ctrl+m", "project")],
      undefined,
    ],
    [
      "keeps an edit in place when it renames the preset",
      {
        hotkey: "ctrl+m",
        name: "plan2",
        replaces: { name: "plan", scope: "user" },
        scope: "user",
      },
      [preset("plan", "ctrl+m"), preset("review", "ctrl+m")],
      undefined,
    ],
    [
      "does not warn about this preset's own saved key",
      {
        hotkey: "Ctrl+M",
        name: "plan",
        replaces: { name: "plan", scope: "user" },
        scope: "user",
      },
      [preset("plan", "ctrl+m")],
      undefined,
    ],
    [
      "does not warn about an empty hotkey",
      { hotkey: "  ", name: "plan", scope: "user" },
      [preset("review", "ctrl+m")],
      undefined,
    ],
  ])("%s", (_label, draft, presets, expected) => {
    expect(diagnoseDraftHotkey(draft, presets)).toEqual(expected);
  });
});
