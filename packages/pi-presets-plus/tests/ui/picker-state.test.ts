/**
 * Covers the picker state controller: moving the selection by line and by
 * page, switching focus between the list and the filter, cycling the scope
 * filter, and which preset stays selected as the visible list changes.
 */
import type { LoadedPreset } from "../../src/types.js";
import {
  cycleScope,
  initialPickerState,
  moveSelection,
  preserveSelectionOrFirst,
  selectedPreset,
  setFocusMode,
  visiblePresets,
} from "../../src/ui/picker-state.js";
import { describe, expect, it } from "vitest";

function makePreset(
  name: string,
  scope: "user" | "project" = "user",
  model = "claude-opus-4.5",
): LoadedPreset {
  return {
    model,
    name,
    provider: "anthropic",
    scope,
  };
}

/** List presets as `scope:name` so assertions can tell scopes apart. */
function scopedNames(presets: readonly LoadedPreset[]): string[] {
  return presets.map((preset) => `${preset.scope}:${preset.name}`);
}

describe("picker state", () => {
  it("starts in list focus with all scope and first item selected", () => {
    expect(initialPickerState()).toEqual({
      focusMode: "list",
      scopeFilter: "all",
      scrollOffset: 0,
      selectedIndex: 0,
    });
  });

  it("switches focus modes immutably", () => {
    const state = initialPickerState();
    const next = setFocusMode(state, "filter");

    expect(next).toEqual({ ...state, focusMode: "filter" });
    expect(state.focusMode).toBe("list");
  });

  it("returns visible presets by scope and query", () => {
    const presets = [
      makePreset("plan", "user"),
      makePreset("ship", "project"),
      makePreset("review", "user", "claude-sonnet-4-5"),
    ];

    const projectState = cycleScope(
      cycleScope(initialPickerState(), presets, "", 1, 4),
      presets,
      "",
      1,
      4,
    );

    expect(scopedNames(visiblePresets(projectState, presets, "ship"))).toEqual([
      "project:ship",
    ]);
  });

  it("wraps vertical movement at list boundaries", () => {
    const presets = [makePreset("a"), makePreset("b"), makePreset("c")];
    const state = initialPickerState();
    const last = moveSelection(state, presets, "", "up", 4);

    expect(selectedPreset(last, presets, "")?.name).toBe("c");
    expect(
      selectedPreset(moveSelection(last, presets, "", "down", 4), presets, "")
        ?.name,
    ).toBe("a");
  });

  it("stops page movement at the first and last preset", () => {
    const presets = [
      makePreset("a"),
      makePreset("b"),
      makePreset("c"),
      makePreset("d"),
      makePreset("e"),
    ];
    const state = initialPickerState();
    const top = moveSelection(state, presets, "", "pageUp", 2);

    expect(selectedPreset(top, presets, "")?.name).toBe("a");

    const middle = moveSelection(top, presets, "", "pageDown", 2);
    const bottom = moveSelection(
      moveSelection(middle, presets, "", "pageDown", 2),
      presets,
      "",
      "pageDown",
      2,
    );

    expect(selectedPreset(middle, presets, "")?.name).toBe("c");
    expect(selectedPreset(bottom, presets, "")?.name).toBe("e");
    expect(bottom.scrollOffset).toBe(3);
  });

  it("cycles scope and preserves selection when still visible", () => {
    const presets = [
      makePreset("global", "user"),
      makePreset("project", "project"),
    ];
    const selectedProject = moveSelection(
      initialPickerState(),
      presets,
      "",
      "down",
      4,
    );
    const projectOnly = cycleScope(
      cycleScope(selectedProject, presets, "", 1, 4),
      presets,
      "",
      1,
      4,
    );

    expect(projectOnly.scopeFilter).toBe("project");
    expect(selectedPreset(projectOnly, presets, "")?.name).toBe("project");
  });

  it("jumps to first visible preset when prior selection is hidden", () => {
    const presets = [
      makePreset("global", "user"),
      makePreset("other", "user"),
      makePreset("project", "project"),
    ];
    const onProject = moveSelection(initialPickerState(), presets, "", "up", 4);

    expect(selectedPreset(onProject, presets, "")?.name).toBe("project");

    const userOnly = cycleScope(onProject, presets, "", 1, 4);

    expect(userOnly.scopeFilter).toBe("user");
    expect(userOnly.selectedIndex).toBe(0);
    expect(selectedPreset(userOnly, presets, "")?.name).toBe("global");
  });

  it("resets selection and scroll when filtering leaves no matches", () => {
    const presets = [makePreset("a"), makePreset("b"), makePreset("c")];
    const scrolled = moveSelection(initialPickerState(), presets, "", "up", 1);
    const next = preserveSelectionOrFirst(
      scrolled,
      presets,
      "zzzz",
      undefined,
      1,
    );

    expect(next.selectedIndex).toBe(0);
    expect(next.scrollOffset).toBe(0);
  });
});
