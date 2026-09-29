/**
 * Covers the hotkey registry: what it binds for a session, how it reports
 * the hotkey warnings, what a bound shortcut does, and when it asks the
 * user to reload after presets change.
 */
import { join } from "node:path";

import { ActivePresetSession } from "../src/activation/session.js";
import { HotkeyRegistry } from "../src/hotkey-registry.js";
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
  registry.bindForSession(presets, ctx, fake.pi, session);

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

  it("shows every hotkey warning in one warning notification", () => {
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
