/**
 * Covers reaching Pi's live TUI through a transient widget: what the
 * factory receives comes back, the widget is gone afterwards, and every
 * other mode or host failure yields nothing.
 */
import { getLiveTui } from "../../src/index.js";
import {
  createFakeContext,
  createFakeTui,
  createFakeWidgets,
  createMarkerTheme,
  type FakeWidgets,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

/** One `setWidget` call: the key, and the content or `undefined`. */
type WidgetCall = [string, string[] | WidgetContent];

/** What a widget factory call passes to `setWidget` besides text lines. */
type WidgetContent = Parameters<FakeWidgets["setWidget"]>[1];

describe("getLiveTui", () => {
  it("returns the TUI and theme Pi hands the widget factory", () => {
    const fake = createFakeTui();
    const theme = createMarkerTheme();
    const ctx = createFakeContext({
      ui: {
        setWidget: (_key: string, content?: string[] | WidgetContent) => {
          if (typeof content === "function") content(fake.tui, theme);
        },
      },
    });
    const live = getLiveTui(ctx, "rtk:tui");

    expect(live?.tui).toBe(fake.tui);
    expect(live?.theme).toBe(theme);
  });

  it("adds a zero-line widget under the key and removes it", () => {
    const fake = createFakeTui();
    const widgets = createFakeWidgets(fake);
    const calls: WidgetCall[] = [];
    const ctx = createFakeContext({
      ui: {
        setWidget: (key: string, content?: string[] | WidgetContent) => {
          calls.push([key, content]);

          if (!Array.isArray(content)) widgets.setWidget(key, content);
        },
      },
    });

    getLiveTui(ctx, "rtk:tui");

    expect(calls).toEqual([
      ["rtk:tui", expect.any(Function)],
      ["rtk:tui", undefined],
    ]);

    const factory = calls[0]?.[1];

    expect(
      typeof factory === "function" &&
        factory(fake.tui, ctx.ui.theme).render(80),
    ).toEqual([]);
  });

  it.each(["rpc", "json", "print"] as const)(
    "returns undefined in %s mode without adding a widget",
    (mode) => {
      const calls: WidgetCall[] = [];
      const ctx = createFakeContext({
        mode,
        ui: {
          setWidget: (key: string, content?: string[] | WidgetContent) => {
            calls.push([key, content]);
          },
        },
      });

      expect(getLiveTui(ctx, "rtk:tui")).toBeUndefined();
      expect(calls).toEqual([]);
    },
  );

  it("returns undefined when Pi does not call the factory", () => {
    const calls: WidgetCall[] = [];
    const ctx = createFakeContext({
      ui: {
        setWidget: (key: string, content?: string[] | WidgetContent) => {
          calls.push([key, content]);
        },
      },
    });

    expect(getLiveTui(ctx, "rtk:tui")).toBeUndefined();
    expect(calls.at(-1)).toEqual(["rtk:tui", undefined]);
  });

  it("returns undefined and still removes the widget when adding it throws", () => {
    const calls: WidgetCall[] = [];
    const ctx = createFakeContext({
      ui: {
        setWidget: (key: string, content?: string[] | WidgetContent) => {
          calls.push([key, content]);

          if (content) throw new Error("no widgets here");
        },
      },
    });

    expect(getLiveTui(ctx, "rtk:tui")).toBeUndefined();
    expect(calls.at(-1)).toEqual(["rtk:tui", undefined]);
  });

  it("returns the TUI when the widget cannot be removed", () => {
    const fake = createFakeTui();
    const widgets = createFakeWidgets(fake);
    const ctx = createFakeContext({
      ui: {
        setWidget: (key: string, content?: string[] | WidgetContent) => {
          if (content === undefined) throw new Error("cannot remove");

          if (!Array.isArray(content)) widgets.setWidget(key, content);
        },
      },
    });

    expect(getLiveTui(ctx, "rtk:tui")?.tui).toBe(fake.tui);
  });
});
