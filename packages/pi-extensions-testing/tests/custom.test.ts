import { createFakeCustom, type CustomComponent } from "../src/index.js";
import type { OverlayHandle } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

/** Records keys and finishes with them on Enter, like a small dialog. */
function keyRecorder(done: (result: unknown) => void): CustomComponent & {
  disposedBeforeDone: boolean | undefined;
} {
  const keys: string[] = [];
  let finished = false;
  const component = {
    disposedBeforeDone: undefined as boolean | undefined,
    dispose() {
      component.disposedBeforeDone = !finished;
    },
    handleInput(data: string) {
      if (data === "\r") {
        finished = true;
        done(keys);
      } else {
        keys.push(data);
      }
    },
    invalidate() {},
    render: (width: number) => [`width ${width}`],
  };

  return component;
}

describe("createFakeCustom", () => {
  it("sends keys in order and resolves with the component's result", async () => {
    const custom = createFakeCustom({ keys: ["a", "b", "\r"] });

    await expect(
      custom((_tui, _theme, _keybindings, done) => keyRecorder(done)),
    ).resolves.toEqual(["a", "b"]);
  });

  it("awaits a factory that builds the component asynchronously", async () => {
    const custom = createFakeCustom({ keys: ["\r"] });

    await expect(
      custom(async (_tui, _theme, _keybindings, done) => {
        await Promise.resolve();

        return keyRecorder(done);
      }),
    ).resolves.toEqual([]);
  });

  it("renders once at the requested width when asked to", async () => {
    const rendered: string[] = [];
    const custom = createFakeCustom({ keys: ["\r"], rendered, width: 42 });

    await custom((_tui, _theme, _keybindings, done) => keyRecorder(done));

    expect(rendered).toEqual(["width 42"]);
  });

  it("passes the handle to the extension's onHandle callback", async () => {
    const handle = {} as OverlayHandle;
    const received: OverlayHandle[] = [];
    const custom = createFakeCustom({ handle, keys: ["\r"] });

    await custom((_tui, _theme, _keybindings, done) => keyRecorder(done), {
      onHandle: (value) => received.push(value),
    });

    expect(received).toEqual([handle]);
  });

  it("disposes the component only after it finishes", async () => {
    let component: ReturnType<typeof keyRecorder> | undefined;
    const custom = createFakeCustom({ keys: ["\r"] });

    await custom((_tui, _theme, _keybindings, done) => {
      component = keyRecorder(done);

      return component;
    });

    expect(component?.disposedBeforeDone).toBe(false);
  });

  it("reports every result the component finishes with to onDone", async () => {
    const results: unknown[] = [];
    const custom = createFakeCustom({
      keys: ["a", "\r", "\r"],
      onDone: (result) => results.push(result),
    });

    await custom((_tui, _theme, _keybindings, done) => keyRecorder(done));

    expect(results).toEqual([["a"], ["a"]]);
  });

  it("lets onMount drive the component and finish it", async () => {
    const custom = createFakeCustom({
      onMount: (component, done) => {
        component.handleInput?.("x");
        done("closed by test");
      },
    });

    await expect(
      custom((_tui, _theme, _keybindings, done) => keyRecorder(done)),
    ).resolves.toBe("closed by test");
  });
});
