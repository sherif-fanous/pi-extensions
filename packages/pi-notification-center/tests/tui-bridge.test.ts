import { createToastSurface, type BridgeUi } from "../src/ui/tui-bridge.js";
import { createFakeTui, createPlainTheme } from "./helpers.js";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

describe("createToastSurface", () => {
  it("creates one non-capturing top-right overlay", () => {
    const fake = createFakeTui();
    const surface = createToastSurface(bridgeUi(fake.tui), stub, {
      anchor: "top-right",
      width: 50,
    });

    expect(surface).toBeDefined();
    expect(fake.overlays).toHaveLength(1);
    expect(fake.overlays[0]?.options?.nonCapturing).toBe(true);
    expect(fake.overlays[0]?.options?.anchor).toBe("top-right");
  });

  it("starts hidden so an idle session shows nothing", () => {
    const fake = createFakeTui();

    createToastSurface(bridgeUi(fake.tui), stub, {});

    expect(fake.overlays[0]?.hidden).toBe(true);
  });

  it("never changes which component holds focus", () => {
    // Regression: ctx.ui.custom's non-overlay branch defocuses the active
    // component and then restores focus to the core editor, which wedges
    // any open interactive component. setWidget never touches focus.
    const fake = createFakeTui();

    createToastSurface(bridgeUi(fake.tui), stub, {});

    expect(fake.focusCalls).toBe(0);
  });

  it("removes its transient widget but keeps the overlay", () => {
    const fake = createFakeTui();
    const calls: (string | undefined)[] = [];
    const ui: BridgeUi = {
      setWidget: (key, content) => {
        calls.push(content === undefined ? undefined : key);

        if (content) content(fake.tui, createPlainTheme());
      },
    };
    const surface = createToastSurface(ui, stub, {});

    expect(calls).toEqual(["notification-center:bridge", undefined]);
    expect(surface).toBeDefined();
    expect(fake.overlays[0]?.hideCalls).toBe(0);
  });

  it("toggles visibility without leaving the overlay stack", () => {
    // Regression: Pi's hideOverlay() pops the last-pushed stack entry
    // without skipping nonCapturing overlays, so this surface must keep
    // its position at the bottom of the stack for the whole session
    // rather than being removed and re-pushed above someone else's
    // overlay.
    const fake = createFakeTui();
    const surface = createToastSurface(bridgeUi(fake.tui), stub, {});

    surface?.setVisible(true);

    expect(fake.overlays[0]?.hidden).toBe(false);
    expect(fake.overlays[0]?.hideCalls).toBe(0);

    surface?.setVisible(false);

    expect(fake.overlays[0]?.hidden).toBe(true);
    expect(fake.overlays[0]?.hideCalls).toBe(0);
    expect(fake.overlays).toHaveLength(1);
  });

  it("removes the overlay permanently on remove", () => {
    const fake = createFakeTui();
    const surface = createToastSurface(bridgeUi(fake.tui), stub, {});

    surface?.remove();

    expect(fake.overlays[0]?.hideCalls).toBe(1);
  });

  it("exposes the live terminal size and a render request", () => {
    const fake = createFakeTui(101, 37);
    const surface = createToastSurface(
      bridgeUi(fake.tui),
      (_theme, terminalSize) => {
        expect(terminalSize()).toEqual({ height: 37, width: 101 });

        return stub();
      },
      {},
    );

    surface?.requestRender();

    expect(fake.renderCalls).toBe(1);
  });

  it("creates only one overlay if the host invokes the factory twice", () => {
    const fake = createFakeTui();
    const ui: BridgeUi = {
      setWidget: (_key, content) => {
        if (content) {
          content(fake.tui, createPlainTheme());
          content(fake.tui, createPlainTheme());
        }
      },
    };

    createToastSurface(ui, stub, {});

    expect(fake.overlays).toHaveLength(1);
  });

  it("degrades to history-only when the widget factory is never called", () => {
    const ui: BridgeUi = { setWidget: () => undefined };

    expect(createToastSurface(ui, stub, {})).toBeUndefined();
  });

  it("degrades to history-only when the widget seam throws", () => {
    const ui: BridgeUi = {
      setWidget: () => {
        throw new Error("no widgets here");
      },
    };

    expect(createToastSurface(ui, stub, {})).toBeUndefined();
  });

  it("degrades to history-only when overlay creation throws", () => {
    const fake = createFakeTui();
    const tui = {
      ...fake.tui,
      showOverlay: () => {
        throw new Error("no overlays here");
      },
    } as unknown as TUI;

    expect(createToastSurface(bridgeUi(tui), stub, {})).toBeUndefined();
  });

  it("still returns a surface when the widget cannot be cleared", () => {
    const fake = createFakeTui();
    const ui: BridgeUi = {
      setWidget: (_key, content) => {
        if (content) {
          content(fake.tui, createPlainTheme());

          return;
        }

        throw new Error("cannot clear");
      },
    };

    expect(createToastSurface(ui, stub, {})).toBeDefined();
  });
});

function bridgeUi(tui: TUI): BridgeUi {
  return {
    setWidget: (_key, content) => {
      if (content) content(tui, createPlainTheme());
    },
  };
}

function stub(): Component {
  return {
    invalidate: () => undefined,
    render: () => [],
  };
}
