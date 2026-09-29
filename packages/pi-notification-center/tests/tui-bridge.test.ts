import { createToastSurface } from "../src/ui/tui-bridge.js";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  createFakeContext,
  createFakeTui,
  createFakeWidgets,
  type FakeTui,
} from "@sherif-fanous/pi-extensions-testing";
import { describe, expect, it } from "vitest";

describe("createToastSurface", () => {
  it("creates one non-capturing top-right overlay", () => {
    const fake = createFakeTui();
    const surface = createToastSurface(liveContext(fake), stub, {
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

    createToastSurface(liveContext(fake), stub, {});

    expect(fake.overlays[0]?.hidden).toBe(true);
  });

  it("never changes which component holds focus", () => {
    // ctx.ui.custom's non-overlay branch defocuses the active component
    // and hands focus to the core editor, which wedges any open
    // interactive component. Reaching the TUI never touches focus.
    const fake = createFakeTui();

    createToastSurface(liveContext(fake), stub, {});

    expect(fake.focusCalls).toBe(0);
  });

  it("toggles visibility without leaving the overlay stack", () => {
    // Pi's hideOverlay() pops the last-pushed stack entry without
    // skipping nonCapturing overlays, so this surface keeps its position
    // at the bottom of the stack for the whole session rather than being
    // removed and re-pushed above another extension's overlay.
    const fake = createFakeTui();
    const surface = createToastSurface(liveContext(fake), stub, {});

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
    const surface = createToastSurface(liveContext(fake), stub, {});

    surface?.remove();

    expect(fake.overlays[0]?.hideCalls).toBe(1);
  });

  it("exposes the live terminal size and a render request", () => {
    const fake = createFakeTui(101, 37);
    const surface = createToastSurface(
      liveContext(fake),
      (_theme, terminalSize) => {
        expect(terminalSize()).toEqual({ height: 37, width: 101 });

        return stub();
      },
      {},
    );

    surface?.requestRender();

    expect(fake.renderCalls).toBe(1);
  });

  it("degrades to history-only when overlay creation throws", () => {
    const fake = createFakeTui();
    const tui = {
      ...fake.tui,
      showOverlay: () => {
        throw new Error("no overlays here");
      },
    } as unknown as TUI;

    expect(
      createToastSurface(liveContext({ ...fake, tui }), stub, {}),
    ).toBeUndefined();
  });
});

function liveContext(fake: FakeTui): ReturnType<typeof createFakeContext> {
  return createFakeContext({ ui: createFakeWidgets(fake) });
}

function stub(): Component {
  return {
    invalidate: () => undefined,
    render: () => [],
  };
}
