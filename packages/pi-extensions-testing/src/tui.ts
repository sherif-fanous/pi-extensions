/**
 * Test doubles shared across suites: a colorless theme, a fake TUI, and a
 * fake keybindings manager.
 *
 * The theme returns text unchanged, so tests can assert on exact,
 * escape-free line content and widths.
 */

import type {
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  type Component,
  type Keybinding,
  type KeybindingsConfig,
  type OverlayHandle,
  type OverlayOptions,
  type TUI,
} from "@earendil-works/pi-tui";

/** Records every overlay created through a fake TUI. */
export interface FakeOverlay {
  component: Component;
  handle: OverlayHandle;
  hidden: boolean;
  hideCalls: number;
  options: OverlayOptions | undefined;
}

/** Fake TUI exposing only what the bridge and overlays touch. */
export interface FakeTui {
  focusCalls: number;
  overlays: FakeOverlay[];
  renderCalls: number;
  tui: TUI;
}

/**
 * Fake extension-UI widget seam.
 *
 * Mirrors Pi by invoking a widget factory immediately, which is how the
 * bridge reaches the TUI instance. Text widgets are ignored.
 */
export interface FakeWidgets {
  setWidget: ExtensionUIContext["setWidget"];
}

/**
 * Keybindings manager matching the literal key names used in tests.
 *
 * `matches` compares input with `keys`. `getKeys` returns Pi's default
 * keys whatever `keys` holds, so key hints render as they do for a user
 * with no remaps; use {@link createPiKeybindings} to test a remap.
 */
export function createFakeKeybindings(
  keys: Record<string, string> = DEFAULT_KEYS,
): KeybindingsManager {
  const defaults = createPiKeybindings();

  return {
    getKeys: (keybinding: Keybinding) => defaults.getKeys(keybinding),
    matches: (data: string, keybinding: string) => keys[keybinding] === data,
  } as unknown as KeybindingsManager;
}

/** Build a fake TUI that records overlays, renders, and focus changes. */
export function createFakeTui(columns = 120, rows = 40): FakeTui {
  const state: FakeTui = {
    focusCalls: 0,
    overlays: [],
    renderCalls: 0,
    tui: undefined as unknown as TUI,
  };

  state.tui = {
    requestRender: () => {
      state.renderCalls += 1;
    },
    setFocus: () => {
      state.focusCalls += 1;
    },
    showOverlay: (component: Component, options?: OverlayOptions) => {
      const overlay: FakeOverlay = {
        component,
        handle: undefined as unknown as OverlayHandle,
        hidden: false,
        hideCalls: 0,
        options,
      };

      overlay.handle = {
        focus: () => {
          state.focusCalls += 1;
        },
        getBounds: () => undefined,
        hide: () => {
          overlay.hideCalls += 1;
        },
        isFocused: () => false,
        isHidden: () => overlay.hidden,
        setHidden: (hidden: boolean) => {
          overlay.hidden = hidden;
        },
        unfocus: () => {
          state.focusCalls += 1;
        },
      };

      state.overlays.push(overlay);

      return overlay.handle;
    },
    terminal: { columns, rows },
  } as unknown as TUI;

  return state;
}

/**
 * Build a fake `setWidget` seam bound to `fake`.
 *
 * The resulting overlay is observable through `fake.overlays`, which is
 * where tests assert on the toast surface.
 */
export function createFakeWidgets(fake: FakeTui): FakeWidgets {
  return {
    setWidget: (
      _key: string,
      content?:
        | ((tui: TUI, theme: Theme) => Component & { dispose?(): void })
        | string[],
    ) => {
      if (typeof content === "function") content(fake.tui, createPlainTheme());
    },
  };
}

/**
 * A theme that wraps text in readable markers instead of ANSI codes.
 *
 * Lets a test assert which color a span was given without matching escape
 * sequences. Markers are not zero-width, so use this only for assertions
 * about styling, never about layout width.
 */
export function createMarkerTheme(): Theme {
  return {
    bg: (color: string, text: string) => `<bg:${color}>${text}</bg>`,
    bold: (text: string) => `<b>${text}</b>`,
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    italic: (text: string) => text,
    inverse: (text: string) => text,
    strikethrough: (text: string) => text,
    underline: (text: string) => text,
  } as unknown as Theme;
}

/**
 * Pi's real keybindings manager with its default TUI keys and
 * `userBindings` applied on top, the way a user's `keybindings.json`
 * remaps them, so tests send real terminal sequences.
 */
export function createPiKeybindings(
  userBindings: KeybindingsConfig = {},
): KeybindingsManager {
  return new KeybindingsManager(TUI_KEYBINDINGS, userBindings);
}

/** A theme that applies no styling, so lines stay exactly measurable. */
export function createPlainTheme(): Theme {
  const identity = (text: string): string => text;

  return {
    bg: (_color: string, text: string) => text,
    bold: identity,
    fg: (_color: string, text: string) => text,
    italic: identity,
    inverse: identity,
    strikethrough: identity,
    underline: identity,
  } as unknown as Theme;
}

const DEFAULT_KEYS: Record<string, string> = {
  "tui.select.cancel": "\u001B",
  "tui.select.down": "DOWN",
  "tui.select.pageDown": "PGDN",
  "tui.select.pageUp": "PGUP",
  "tui.select.up": "UP",
};
