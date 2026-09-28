/**
 * Covers selector ranking, keyboard selection through Pi's keybindings,
 * the empty states, and bounded rendering.
 */
import {
  openModelSelector,
  rankModelSelectorItems,
  type ModelSelectorItem,
} from "../../src/ui/model-selector.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type {
  Component,
  Focusable,
  KeybindingsManager,
} from "@earendil-works/pi-tui";
import { overlayOptions } from "@sherif-fanous/pi-extensions-core";
import {
  createPiKeybindings,
  createPlainTheme,
  findOverflowingLines,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it, vi } from "vitest";

const theme = createPlainTheme();
const items: ModelSelectorItem[] = [
  { id: "claude-5-opus", available: false },
  { id: "opus-5-thinking" },
  { id: "OPUS_5" },
  { id: "claude-opus-4.5" },
  { id: "opus-50" },
  { id: "internal", name: "Astra" },
];

function harness(
  options = { title: "Select model", current: "internal", items },
  rows = 24,
  keybindings: KeybindingsManager = createPiKeybindings(),
) {
  let component: (Component & Focusable) | undefined;
  let customOptions: unknown;
  const terminal = { rows };
  const requestRender = vi.fn();
  const ctx = {
    ui: {
      custom: (
        factory: (
          tui: unknown,
          theme: Theme,
          keys: unknown,
          done: (value: string | undefined) => void,
        ) => Component & Focusable,
        opened: unknown,
      ) =>
        new Promise<string | undefined>((resolve) => {
          customOptions = opened;
          component = factory(
            { terminal, requestRender },
            theme,
            keybindings,
            resolve,
          );
          component.focused = true;
        }),
    },
  } as unknown as Parameters<typeof openModelSelector>[0];
  const result = openModelSelector(ctx, options);

  if (!component) throw new Error("Selector was not opened.");

  return { component, customOptions, result, terminal, requestRender };
}

function type(component: Component, text: string): void {
  for (const char of text) component.handleInput?.(char);
}

describe("rankModelSelectorItems", () => {
  it("normalizes punctuation, case, whitespace and ranks exact and prefix before stable token matches", () => {
    expect(
      rankModelSelectorItems(items, "  OPUS   5 ").map((item) => item.id),
    ).toEqual([
      "OPUS_5",
      "opus-5-thinking",
      "opus-50",
      "claude-5-opus",
      "claude-opus-4.5",
    ]);
    expect(rankModelSelectorItems(items, "5 opus")).toHaveLength(5);
    expect(rankModelSelectorItems(items, "opus_5")).toEqual(
      rankModelSelectorItems(items, "opus 5"),
    );
  });

  it("searches display names, excludes annotations, and does not use fuzzy matching", () => {
    expect(rankModelSelectorItems(items, "astra")).toEqual([items[5]]);
    expect(rankModelSelectorItems(items, "no key")).toEqual([]);
    expect(rankModelSelectorItems(items, "ops")).toEqual([]);
    expect(rankModelSelectorItems(items, "fable 5")).toEqual([]);
  });

  it("preserves input order for empty and punctuation-only queries without mutating input", () => {
    expect(rankModelSelectorItems(items, " ")).toEqual(items);
    expect(rankModelSelectorItems(items, "---")).toEqual(items);
    expect(items[0]?.id).toBe("claude-5-opus");
  });
});

describe("openModelSelector", () => {
  it("opens as a nested overlay", () => {
    expect(harness().customOptions).toEqual({
      overlay: true,
      overlayOptions: overlayOptions("nested"),
    });
  });

  it("starts focused with the current value and confirms only once", async () => {
    const { component, result } = harness();

    expect(component.focused).toBe(true);
    expect(component.render(80).join("\n")).toContain("→ internal");
    component.handleInput?.("\r");
    component.handleInput?.("\u001b");
    await expect(result).resolves.toBe("internal");
  });

  it("filters immediately, navigates both directions and edits with backspace", async () => {
    const { component, result, requestRender } = harness();

    type(component, "opus 5x");
    expect(component.render(80).join("\n")).toContain(
      "No options match this search.",
    );
    component.handleInput?.("\u007f");
    expect(component.render(80).join("\n")).toContain("→ OPUS_5");
    component.handleInput?.("\u001b[B");
    component.handleInput?.("\u001b[A");
    component.handleInput?.("\r");
    await expect(result).resolves.toBe("OPUS_5");
    expect(requestRender).toHaveBeenCalled();
  });

  it("follows remapped list bindings instead of the default keys", async () => {
    const { component, result } = harness(
      undefined,
      24,
      createPiKeybindings({
        "tui.select.confirm": "ctrl+o",
        "tui.select.down": "ctrl+n",
        "tui.select.up": "ctrl+p",
      }),
    );

    component.handleInput?.("\u000E");
    expect(component.render(80).join("\n")).toContain("→ claude-5-opus");
    component.handleInput?.("\u0010");
    expect(component.render(80).join("\n")).toContain("→ internal");
    component.handleInput?.("\u001b[B");
    component.handleInput?.("\r");
    expect(component.render(80).join("\n")).toContain("→ internal");
    expect(component.render(80).join("\n")).toContain("Ctrl+P/Ctrl+N Move");
    component.handleInput?.("\u000F");
    await expect(result).resolves.toBe("internal");
  });

  it("moves one page with PgDn and stops at the last option", async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      id: `model-${String(index).padStart(2, "0")}`,
    }));
    const { component, result } = harness(
      { title: "Select Model", current: "model-00", items: many },
      20,
    );
    const lines = component.render(60);

    expect(lines[0]).toContain("(1/40)");

    component.handleInput?.("\u001b[6~");
    expect(component.render(60)[0]).toContain("(12/40)");

    for (let press = 0; press < 5; press++)
      component.handleInput?.("\u001b[6~");
    component.handleInput?.("\r");
    await expect(result).resolves.toBe("model-39");
  });

  it("tells an empty list apart from a search without matches", () => {
    const { component } = harness({
      title: "Select Model",
      current: "",
      items: [],
    });

    expect(component.render(60).join("\n")).toContain(
      "No options to choose from.",
    );
  });

  it("cancels on Ctrl+C, which Pi binds to cancel", async () => {
    const { component, result } = harness();

    component.handleInput?.("\u0003");
    await expect(result).resolves.toBeUndefined();
  });

  it("wraps the footer instead of cutting off Esc Cancel", () => {
    const { component } = harness();
    const lines = component.render(40).join("\n");

    expect(lines).toContain("Enter Select");
    expect(lines).toContain("Esc Cancel");
  });

  it("clears query to current selection and discards search on reopening", async () => {
    const first = harness();

    type(first.component, "astra");
    for (let index = 0; index < 5; index++)
      first.component.handleInput?.("\u007f");
    expect(first.component.render(80).join("\n")).toContain("→ internal");
    type(first.component, "opus");
    first.component.handleInput?.("\u001b");
    await expect(first.result).resolves.toBeUndefined();

    const second = harness();

    expect(second.component.render(80).join("\n")).toContain("→ internal");
  });

  it.each([{ options: [] }, { options: items }])(
    "keeps no-match Enter inert and allows Escape",
    async ({ options }) => {
      const { component, result } = harness({
        title: "Select model",
        current: "missing",
        items: options,
      });
      const resolved = vi.fn();

      void result.then(resolved);
      type(component, "unmatched");
      component.handleInput?.("\r");
      await Promise.resolve();
      expect(resolved).not.toHaveBeenCalled();
      component.handleInput?.("\u001b");
      await expect(result).resolves.toBeUndefined();
    },
  );

  it("selects a no-key option and falls back to first for an unknown current value", async () => {
    const { component, result } = harness({
      title: "Select model",
      current: "unknown",
      items,
    });

    expect(component.render(80).join("\n")).toContain(
      "→ claude-5-opus (no key)",
    );
    component.handleInput?.("\r");
    await expect(result).resolves.toBe("claude-5-opus");
  });

  it("keeps a selection visible across hundreds of entries and terminal resizing", () => {
    const many = Array.from({ length: 400 }, (_, index) => ({
      id: `${index}-very-long-identifier-${"x".repeat(100)}`,
    }));
    const { component, terminal } = harness({
      title: "Select model",
      current: many[300]?.id ?? "",
      items: many,
    });

    for (const rows of [24, 12, 8, 5, 3]) {
      terminal.rows = rows;
      component.handleInput?.("\u001b[B");

      for (const width of [80, 40, 20, 4, 1]) {
        const lines = component.render(width);

        expect(lines.length).toBeLessThanOrEqual(rows - 2);
        expect(findOverflowingLines(lines, width)).toEqual([]);
        if (width >= 20)
          expect(lines.some((line) => line.includes("→ 30"))).toBe(true);
      }
    }
  });
});
