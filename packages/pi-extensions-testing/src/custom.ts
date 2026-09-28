/**
 * A stand-in for Pi's `ctx.ui.custom` that mounts the component the
 * extension builds and lets the test play the user.
 */

import {
  createFakeKeybindings,
  createFakeTui,
  createPlainTheme,
} from "./tui.js";
import type {
  KeybindingsManager as AgentKeybindingsManager,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type {
  Component,
  KeybindingsManager,
  OverlayHandle,
  TUI,
} from "@earendil-works/pi-tui";

/** How the fake `ctx.ui.custom` mounts and drives the component. */
export interface FakeCustomOptions {
  /** Passed to the extension's `onHandle` callback when given. */
  readonly handle?: OverlayHandle;
  /** Defaults to `createFakeKeybindings()`. */
  readonly keybindings?: KeybindingsManager;
  /** Keypresses sent to the component, in order, after it mounts. */
  readonly keys?: readonly string[];
  /** Called with every result the component passes to `done`. */
  readonly onDone?: (result: unknown) => void;
  /**
   * Called after the component mounts, renders, and receives `keys`. Use it
   * to drive the component step by step, or to call `done` for a
   * component that never finishes by itself.
   */
  readonly onMount?: (
    component: CustomComponent,
    done: (result: unknown) => void,
  ) => Promise<void> | void;
  /** Receives the lines rendered once after mount. Skipped when absent. */
  readonly rendered?: string[];
  /** Defaults to `createPlainTheme()`. */
  readonly theme?: Theme;
  /** Defaults to the `tui` of `createFakeTui()`. */
  readonly tui?: TUI;
  /** Render width for `rendered`. Defaults to 80. */
  readonly width?: number;
}

/** A component mounted through `ctx.ui.custom`. */
export type CustomComponent = Component & { dispose?(): void };

/**
 * Build a fake `ctx.ui.custom`.
 *
 * It calls the extension's factory, sends `keys`, runs `onMount`, and
 * resolves with the value the component passes to `done`. Like Pi, it
 * then disposes the component. It records nothing: wrap it in `vi.fn()`
 * to assert on calls.
 */
export function createFakeCustom(
  options: FakeCustomOptions = {},
): ExtensionUIContext["custom"] {
  const custom = async (
    factory: Parameters<ExtensionUIContext["custom"]>[0],
    customOptions?: Parameters<ExtensionUIContext["custom"]>[1],
  ): Promise<unknown> => {
    let finish: (result: unknown) => void = () => {};
    const closed = new Promise<unknown>((resolve) => {
      finish = (result) => {
        options.onDone?.(result);
        resolve(result);
      };
    });
    const component = await factory(
      options.tui ?? createFakeTui().tui,
      options.theme ?? createPlainTheme(),
      // Components only call the pi-tui subset that the fakes implement.
      (options.keybindings ??
        createFakeKeybindings()) as unknown as AgentKeybindingsManager,
      finish,
    );

    if (options.handle) customOptions?.onHandle?.(options.handle);

    options.rendered?.push(...component.render(options.width ?? 80));

    for (const key of options.keys ?? []) component.handleInput?.(key);

    await options.onMount?.(component, finish);

    const result = await closed;

    component.dispose?.();

    return result;
  };

  return custom as ExtensionUIContext["custom"];
}
