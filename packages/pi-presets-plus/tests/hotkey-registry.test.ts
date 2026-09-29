/**
 * Covers the hotkey registry: how it flags conflicting, invalid, and
 * shadowing hotkeys, what it binds for a session, and when it asks the
 * user to reload after presets change.
 */
import { join } from "node:path";

import { ActivePresetSession } from "../src/activation/session.js";
import {
  analyzeHotkeys,
  formatPresetIdentity,
  hotkeyChanged,
  HotkeyRegistry,
} from "../src/hotkey-registry.js";
import type { LoadedPreset } from "../src/types.js";
import { makeStubModelRegistry } from "./helpers/model-registry.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createFakePi,
  createTempConfigDirs,
  type FakeShortcut,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it, vi } from "vitest";

/** Bind `presets` for a session and record what the bound shortcuts do. */
function bind(
  registry: HotkeyRegistry,
  presets: LoadedPreset[],
  ctx: ExtensionCommandContext = createFakeContext({ cwd: "/tmp/project" }),
) {
  const notify = vi.fn();
  const setModel = vi.fn(() => Promise.resolve(true));
  const fake = createFakePi({ setModel });
  const session = new ActivePresetSession();

  Object.assign(ctx.ui, { notify });
  registry.bindForSession(
    presets,
    analyzeHotkeys(presets),
    ctx,
    fake.pi,
    session,
  );

  return {
    appendedEntries: fake.appendedEntries,
    ctx,
    notify,
    setModel,
    shortcuts: fake.shortcuts,
  };
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

/** Each registered key with its description, in registration order. */
function shortcutDescriptions(
  shortcuts: Map<string, FakeShortcut>,
): [string, string | undefined][] {
  return [...shortcuts].map(([key, { description }]) => [key, description]);
}

describe("hotkeyChanged", () => {
  it.each([
    ["both empty", "", "", false],
    ["both undefined", undefined, undefined, false],
    ["one empty and one whitespace", "", "   ", false],
    ["same hotkey", "ctrl+1", "ctrl+1", false],
    ["equivalent hotkey casing", "Ctrl+1", "ctrl+1", false],
    ["equivalent modifier order", "shift+ctrl+1", "ctrl+shift+1", false],
    ["different hotkeys", "ctrl+1", "ctrl+2", true],
    ["removed hotkey", "ctrl+1", "", true],
    ["added hotkey", "", "ctrl+1", true],
  ])("detects %s", (_label, prev, next, expected) => {
    expect(hotkeyChanged(prev, next)).toBe(expected);
  });
});

describe("formatPresetIdentity", () => {
  it("formats name and scope without making scope look like part of the name", () => {
    expect(formatPresetIdentity({ name: "plan", scope: "project" })).toBe(
      '"plan" (project)',
    );
  });
});

describe("analyzeHotkeys", () => {
  it("marks only later presets with the same normalized hotkey", () => {
    const presets = [
      preset("plan", "ctrl+shift+1", "user"),
      preset("review", "shift+ctrl+1", "project"),
      preset("ship", "alt+s", "user"),
    ];

    const analysis = analyzeHotkeys(presets);

    expect(presets[0]?.hotkeyConflict).toBeUndefined();
    expect(presets[1]?.hotkeyConflict).toBe(true);
    expect(presets[2]?.hotkeyConflict).toBeUndefined();
    expect(analysis.conflicts).toHaveLength(1);
    expect(analysis.conflicts[0]?.winner).toEqual({
      name: "plan",
      scope: "user",
    });
    expect(analysis.parsed.size).toBe(3);
    expect(analysis.invalid).toEqual([]);
  });

  it("clears stale conflict markers before recomputing", () => {
    const presets = [
      { ...preset("plan", "ctrl+shift+1"), hotkeyConflict: true as const },
      { ...preset("review", "ctrl+shift+2"), hotkeyConflict: true as const },
    ];

    const analysis = analyzeHotkeys(presets);

    expect(analysis.conflicts).toEqual([]);
    expect(presets[0]?.hotkeyConflict).toBeUndefined();
    expect(presets[1]?.hotkeyConflict).toBeUndefined();
  });

  it("reports invalid hotkeys and excludes them from parsed hotkeys", () => {
    const presets = [preset("plan", "ctrl+ctrl+p")];
    const analysis = analyzeHotkeys(presets);

    expect(analysis.conflicts).toEqual([]);
    expect(analysis.invalid).toHaveLength(1);
    expect(analysis.invalid[0]?.reason).toBe('duplicate modifier "ctrl"');
    expect(analysis.parsed.size).toBe(0);
  });

  it("annotates Pi built-in shadowing and clears stale markers", () => {
    const builtin = preset("plan", "ctrl+l");
    const ordinary = preset("review", "ctrl+shift+9");
    const empty = preset("ship", undefined);
    const malformed = preset("debug", "ctrl+ctrl+p");

    analyzeHotkeys([builtin, ordinary, empty, malformed]);

    expect(builtin.hotkeyShadowsBuiltin).toBe(true);
    expect(ordinary.hotkeyShadowsBuiltin).toBeUndefined();
    expect(empty.hotkeyShadowsBuiltin).toBeUndefined();
    expect(malformed.hotkeyShadowsBuiltin).toBeUndefined();

    builtin.hotkey = "ctrl+shift+9";

    analyzeHotkeys([builtin]);

    expect(builtin.hotkeyShadowsBuiltin).toBeUndefined();
  });

  it("annotates shadowed presets that use Pi built-in hotkeys", () => {
    const shadowed = { ...preset("plan", "ctrl+l"), shadowed: true };

    analyzeHotkeys([shadowed]);

    expect(shadowed.hotkeyShadowsBuiltin).toBe(true);
  });
});

describe("HotkeyRegistry.bindForSession", () => {
  it("registers normalized keys, skips losing conflicts, and captures baseline", () => {
    const registry = new HotkeyRegistry();
    const presets = [
      preset("plan", "Shift + CTRL + 1"),
      preset("review", "ctrl+shift+1"),
      preset("ship", "alt+s"),
    ];

    const { notify, shortcuts } = bind(registry, presets);

    expect(shortcutDescriptions(shortcuts)).toEqual([
      ["ctrl+shift+1", 'Activate preset "plan"'],
      ["alt+s", 'Activate preset "ship"'],
    ]);

    expect(notify).toHaveBeenCalledWith(
      'Presets Plus: 1 warning\n- Preset "review" hotkey "ctrl+shift+1" conflicts with preset "plan" (user). The first registered wins.',
      "warning",
    );

    expect(registry.deleteNeedsReload({ name: "plan", scope: "user" })).toBe(
      true,
    );
  });

  it("warns about invalid hotkeys", () => {
    const registry = new HotkeyRegistry();
    const presets = [preset("plan", "ctrl+ctrl+p")];

    const { notify, shortcuts } = bind(registry, presets);

    expect(shortcuts.size).toBe(0);
    expect(notify).toHaveBeenCalledWith(
      'Presets Plus: 1 warning\n- Preset "plan" has invalid hotkey "ctrl+ctrl+p" (duplicate modifier "ctrl"). Ignored it, so it is not registered or checked for conflicts until it is fixed.',
      "warning",
    );
  });

  it("notifies when a hotkey shadows a Pi built-in", () => {
    const registry = new HotkeyRegistry();

    const { notify } = bind(registry, [preset("plan", "ctrl+l")]);

    expect(notify).toHaveBeenCalledWith(
      'Presets Plus: 1 warning\n- Preset "plan" hotkey "ctrl+l" shadows a Pi built-in. The preset binding will take precedence.',
      "warning",
    );
  });

  it("uses warning severity for both collision-style notifications", () => {
    const registry = new HotkeyRegistry();

    const { notify } = bind(registry, [
      preset("plan", "ctrl+l"),
      preset("review", "ctrl+l"),
    ]);

    expect(notify.mock.calls).toEqual([
      [
        'Presets Plus: 2 warnings\n- Preset "review" hotkey "ctrl+l" conflicts with preset "plan" (user). The first registered wins.\n- Preset "plan" hotkey "ctrl+l" shadows a Pi built-in. The preset binding will take precedence.',
        "warning",
      ],
    ]);
  });

  it("skips shadowed presets", () => {
    const registry = new HotkeyRegistry();
    const presets = [
      preset("plan", "ctrl+shift+1", "user", { shadowed: true }),
      preset("plan", "ctrl+shift+2", "project"),
    ];

    const { shortcuts } = bind(registry, presets);

    expect(shortcutDescriptions(shortcuts)).toEqual([
      ["ctrl+shift+2", 'Activate preset "plan"'],
    ]);
  });

  it("activates the registered preset as the files read when the key is pressed", async () => {
    const dirs = await createTempConfigDirs();

    try {
      const registry = new HotkeyRegistry();
      const bound = preset("plan", "ctrl+shift+1");
      const ctx = createFakeContext({
        cwd: dirs.cwd,
        modelRegistry: makeStubModelRegistry({
          models: { anthropic: { "claude-sonnet": { hasKey: true } } },
        }),
      });
      const { appendedEntries, setModel, shortcuts } = bind(
        registry,
        [bound],
        ctx,
      );

      await dirs.writeJson(join(dirs.agentDir, "presets-plus", "config.json"), {
        presets: [
          {
            hotkey: "ctrl+shift+1",
            model: "claude-sonnet",
            name: "plan",
            provider: "anthropic",
          },
        ],
        version: 2,
      });
      await shortcuts.get("ctrl+shift+1")?.handler(ctx);

      expect(setModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: "claude-sonnet" }),
      );

      expect(appendedEntries.map((entry) => entry.data)).toEqual([
        expect.objectContaining({ name: "plan", scope: "user" }),
      ]);
    } finally {
      await dirs.cleanup();
    }
  });

  it("reports a failed activation as a hotkey error", async () => {
    const dirs = await createTempConfigDirs();

    try {
      const registry = new HotkeyRegistry();
      const ctx = createFakeContext({
        cwd: dirs.cwd,
        isProjectTrusted: () => {
          throw new Error("boom");
        },
      });
      const { notify, shortcuts } = bind(
        registry,
        [preset("plan", "ctrl+shift+1")],
        ctx,
      );

      await shortcuts.get("ctrl+shift+1")?.handler(ctx);

      expect(notify).toHaveBeenCalledExactlyOnceWith(
        'Presets Plus hotkey for preset "plan" failed: boom.',
        "error",
      );
    } finally {
      await dirs.cleanup();
    }
  });
});

describe("HotkeyRegistry reload decisions", () => {
  it("reports save/delete reload needs and suppresses repeated declined prompts", () => {
    const registry = new HotkeyRegistry();
    const initial = preset("plan", "ctrl+1");

    bind(registry, [initial]);

    const changed = { ...initial, hotkey: "ctrl+2" };

    expect(registry.saveNeedsReload(initial, changed)).toBe(true);

    registry.recordReloadPromptDeclined(changed);

    expect(registry.saveNeedsReload(initial, changed)).toBe(false);
    expect(registry.deleteNeedsReload(initial)).toBe(true);
  });

  it("prompts when identity moves with an unchanged runtime hotkey", () => {
    const registry = new HotkeyRegistry();
    const initial = preset("plan", "ctrl+1", "user");

    bind(registry, [initial]);

    expect(
      registry.saveNeedsReload(initial, preset("plan", "ctrl+1", "project")),
    ).toBe(true);
  });
});

describe("HotkeyRegistry.changedHotkeyNames", () => {
  it("returns nothing when the file matches the bound hotkeys", () => {
    const registry = new HotkeyRegistry();

    bind(registry, [preset("plan", "ctrl+1"), preset("notes", undefined)]);

    expect(
      registry.changedHotkeyNames([
        preset("plan", "Ctrl+1"),
        preset("notes", undefined),
      ]),
    ).toEqual([]);
  });

  it("names added, changed, and removed hotkeys, and deleted bound presets", () => {
    const registry = new HotkeyRegistry();

    bind(registry, [
      preset("plan", "ctrl+1"),
      preset("review", "ctrl+2"),
      preset("draft", "ctrl+3"),
      preset("gone", "ctrl+4"),
    ]);

    expect(
      registry.changedHotkeyNames([
        preset("plan", "ctrl+5"),
        preset("review", undefined),
        preset("draft", "ctrl+3"),
        preset("fresh", "ctrl+6"),
      ]),
    ).toEqual(["plan", "review", "fresh", "gone"]);
  });
});
