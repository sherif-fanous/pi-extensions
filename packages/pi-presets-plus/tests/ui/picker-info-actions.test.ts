/**
 * Covers the picker actions that open a dialog: status, clear, and failed
 * activation. Each test drives a keypress through the picker and checks the
 * dialog it opens, the overlay focus it restores, and how failures surface.
 */
import type { ApplyResult } from "../../src/activation/apply.js";
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import type { PickerCommandHost } from "../../src/ui/picker-commands.js";
import type { Component, OverlayHandle } from "@earendil-works/pi-tui";
import {
  createFakeCustom,
  createFakeTui,
  createMarkerTheme,
  createPiKeybindings,
  createPlainTheme,
} from "@sherif-fanous/pi-extensions-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAll = vi.fn();
const openConfirm = vi.fn();
const openInfoDialog = vi.fn();
const reorderWithinScope = vi.fn();

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return {
    ...actual,
    addPreset: vi.fn(),
    loadAll,
    removePreset: vi.fn(),
    reorderWithinScope,
  };
});

vi.mock("../../src/ui/confirm.js", () => ({
  openConfirm,
}));

vi.mock("../../src/ui/info-dialog.js", () => ({
  openInfoDialog,
}));

const { PickerCommands: pickerCommandsClass } =
  await import("../../src/ui/picker-commands.js");
const { openPicker } = await import("../../src/ui/picker.js");

/** Preset the picker starts with selected. */
const selected: LoadedPreset = {
  model: "claude-opus-4.5",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};

interface PickerHarness {
  readonly appendEntry: ReturnType<typeof vi.fn>;
  readonly done: ReturnType<typeof vi.fn>;
  readonly focus: ReturnType<typeof vi.fn>;
  readonly handleInput: (input: string) => void;
  readonly notify: ReturnType<typeof vi.fn>;
  readonly setHidden: ReturnType<typeof vi.fn>;
}

interface RunPickerOptions {
  readonly active?: boolean;
  readonly onActivate?: (preset: LoadedPreset) => Promise<ApplyResult>;
  readonly presets?: LoadedPreset[];
  /** Replaces the status action's load, which follows the picker's own. */
  readonly statusLoad?: () => Promise<unknown>;
  readonly statusWarnings?: string[];
  readonly withPi?: boolean;
}

/** The `Config:` block every status report in these tests ends with. */
const CONFIG_LINES = [
  "Config:",
  "  User: loaded",
  "        /agent/presets-plus/config.json",
];
/** {@link CONFIG_LINES} as the marker theme styles them in a dialog. */
const STYLED_CONFIG = [
  "<muted>Config:</muted>",
  "  <muted>User:</muted> loaded",
  "        /agent/presets-plus/config.json",
].join("\n");

/**
 * Build an extension context whose overlay mounts the picker, feeds it the
 * given input, and exposes the spies each test asserts on.
 */
function makeCtx(
  input: string,
): PickerHarness & Parameters<typeof openPicker>[0] {
  const appendEntry = vi.fn();
  const done = vi.fn();
  const focus = vi.fn();
  const notify = vi.fn();
  const setHidden = vi.fn();
  const handle: OverlayHandle = {
    focus,
    getBounds: vi.fn(),
    hide: vi.fn(),
    isFocused: vi.fn(),
    isHidden: vi.fn(),
    setHidden,
    unfocus: vi.fn(),
  };
  /** Closes the overlay without the picker choosing a result. */
  const release = Symbol("release");
  let picker: Component | undefined;

  return {
    appendEntry,
    getActiveTools: () => [],
    getAllTools: () => [],
    getThinkingLevel: () => "medium",
    ui: {
      custom: createFakeCustom({
        keybindings: createPiKeybindings(),
        handle,
        keys: [input],
        onDone: (result) => {
          if (result !== release) done(result);
        },
        onMount: (mounted, finish) => {
          picker = mounted;
          setTimeout(() => finish(release), 10);
        },
        theme: createMarkerTheme(),
        tui: createFakeTui(120, 24).tui,
      }),
      notify,
      setStatus: vi.fn(),
      theme: createPlainTheme(),
    },
    done,
    focus,
    handleInput: (nextInput: string) => picker?.handleInput?.(nextInput),
    notify,
    setHidden,
  } as unknown as PickerHarness & Parameters<typeof openPicker>[0];
}

/** Open the picker over fake presets and drain its pending timers. */
async function runPicker(
  input: string,
  options: RunPickerOptions = {},
): Promise<PickerHarness> {
  const {
    active = false,
    onActivate = () => Promise.resolve({ ok: true } as const),
    presets = [selected],
    statusLoad,
    statusWarnings = [],
    withPi = true,
  } = options;
  const ctx = makeCtx(input);
  const session = new ActivePresetSession();
  const loaded = {
    config: { statusLines: CONFIG_LINES, statusWarnings },
    presets,
  };

  loadAll.mockResolvedValue(loaded);

  if (statusLoad) {
    loadAll.mockResolvedValueOnce(loaded).mockImplementationOnce(statusLoad);
  }

  if (active) {
    session.restoreFromBranch(
      [
        {
          customType: "presets-plus:active",
          data: { name: selected.name, scope: selected.scope },
          type: "custom",
        },
      ] as never,
      [selected],
      ctx,
    );
  }

  const opened = openPicker(ctx, {
    hotkeys: new HotkeyRegistry(),
    onActivate,
    pi: withPi ? (ctx as never) : undefined,
    session,
  });

  await vi.runAllTimersAsync();
  await opened;
  await vi.runAllTimersAsync();

  return ctx;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  openConfirm.mockResolvedValue(true);
  openInfoDialog.mockResolvedValue(undefined);
});

describe("openPicker info actions", () => {
  it("opens activation refusals in an info-dialog whose body is error colored", async () => {
    const ctx = await runPicker("\r", {
      onActivate: () =>
        Promise.resolve({
          kind: "no-key",
          ok: false,
          reason:
            'Preset "plan" is unavailable: missing API key. Activation skipped.',
        } as const),
    });

    expect(openInfoDialog).toHaveBeenCalledWith(ctx, {
      body: '<error>Preset "plan" is unavailable: missing API key. Activation skipped.</error>',
      title: "Activation Failed",
    });
    expect(ctx.notify).not.toHaveBeenCalled();
    expect(ctx.setHidden).toHaveBeenCalledWith(true);
    expect(ctx.setHidden).toHaveBeenCalledWith(false);
    expect(ctx.focus).toHaveBeenCalledOnce();
  });

  it("opens status in an info-dialog and restores picker focus", async () => {
    const ctx = await runPicker("s");

    // The dialog title replaces the report heading.
    expect(openInfoDialog).toHaveBeenCalledWith(ctx, {
      body: `  No preset is active.\n\n${STYLED_CONFIG}`,
      title: "Presets Plus Status",
    });
    expect(ctx.setHidden).toHaveBeenCalledWith(true);
    expect(ctx.setHidden).toHaveBeenCalledWith(false);
    expect(ctx.focus).toHaveBeenCalledOnce();
  });

  it("ends the status dialog with the configuration's warnings", async () => {
    await runPicker("s", { statusWarnings: ["failed to read user presets"] });

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: [
        "  No preset is active.",
        "",
        STYLED_CONFIG,
        "",
        "<warning>Warnings:</warning>",
        "<warning>- failed to read user presets</warning>",
      ].join("\n"),
      title: "Presets Plus Status",
    });
  });

  it("colors the first line of a warning status report", async () => {
    await runPicker("s", { active: true, presets: [] });

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: `<warning>  Active preset "plan" is no longer loaded.</warning>\n\n${STYLED_CONFIG}`,
      title: "Presets Plus Status",
    });
  });

  it("explains status unavailability when pi is not provided", async () => {
    await runPicker("s", { withPi: false });

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: "<warning>Pi did not provide the API needed for this action.</warning>",
      title: "Status Unavailable",
    });
  });

  it("short-circuits clear with an info-dialog when no preset is active", async () => {
    const ctx = await runPicker("c");

    expect(openConfirm).not.toHaveBeenCalled();
    expect(ctx.appendEntry).not.toHaveBeenCalled();
    expect(openInfoDialog).toHaveBeenCalledWith(ctx, {
      body: "No preset is active.",
      title: "Clear Unavailable",
    });
    expect(ctx.setHidden).toHaveBeenCalledWith(true);
    expect(ctx.setHidden).toHaveBeenCalledWith(false);
    expect(ctx.focus).toHaveBeenCalledOnce();
    expect(ctx.done).not.toHaveBeenCalled();
  });

  it("shows confirmed clear summary in an info-dialog, not notify", async () => {
    const ctx = await runPicker("c", { active: true });

    expect(openConfirm).toHaveBeenCalledOnce();
    expect(ctx.appendEntry).toHaveBeenCalledWith(
      "presets-plus:active",
      expect.objectContaining({ name: null }),
    );

    expect(openInfoDialog).toHaveBeenCalledWith(ctx, {
      body: [
        "No saved baseline. Pi left your current settings unchanged.",
        "  <muted>Preset:</muted>         plan",
        "  <muted>Model:</muted>          none (No baseline saved for this field)",
        "  <muted>Thinking level:</muted> medium (No baseline saved for this field)",
        "  <muted>Tools:</muted>          none (No baseline saved for this field)",
      ].join("\n"),
      title: "Presets Plus Cleared",
    });
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("explains clear unavailability when pi is not provided", async () => {
    await runPicker("c", { withPi: false });

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: "<warning>Pi did not provide the API needed for this action.</warning>",
      title: "Clear Unavailable",
    });
  });

  it("does not open info-dialog when clear confirm is declined", async () => {
    openConfirm.mockResolvedValue(false);

    const ctx = await runPicker("c", { active: true });

    expect(ctx.appendEntry).not.toHaveBeenCalled();
    expect(openInfoDialog).not.toHaveBeenCalled();
  });

  it("reports a thrown action, ignores pending input, and accepts a later action", async () => {
    let rejectStatus: ((reason?: unknown) => void) | undefined;
    const next = { ...selected, name: "ship" };
    const onActivate = vi.fn().mockResolvedValue({ ok: true });

    const ctx = await runPicker("s", {
      onActivate,
      presets: [selected, next],
      statusLoad: () =>
        new Promise((_resolve, reject) => {
          rejectStatus = reject;
        }),
    });

    ctx.handleInput("\u001b[B");
    ctx.handleInput("/");
    ctx.handleInput("x");
    ctx.handleInput("\r");

    expect(openConfirm).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();

    if (!rejectStatus) throw new Error("Status action did not start.");
    rejectStatus(new Error("Status failed"));
    await vi.runAllTimersAsync();

    expect(ctx.notify).toHaveBeenCalledOnce();
    expect(ctx.notify).toHaveBeenCalledWith(
      "Could not complete the action: Status failed.",
      "error",
    );

    ctx.handleInput("\r");
    await vi.runAllTimersAsync();

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith(selected);
  });

  it("reports a rejected reorder without refreshing the picker", async () => {
    const reason =
      "Presets Plus did not change the user preset file at /tmp/presets.json. It could not load the complete file. Fix the file and try again.";
    const notify = vi.fn();
    const refreshPresets = vi.fn();
    const next = { ...selected, name: "ship" };
    const host = {
      ctx: {},
      finish: vi.fn(),
      getAllPresets: () => [selected, next],
      hotkeys: new HotkeyRegistry(),
      onActivate: vi.fn(),
      pi: undefined,
      currentSelection: () => selected,
      refreshPresets,
      runWithHiddenOverlay: vi.fn(),
      session: new ActivePresetSession(),
      theme: {},
      ui: { notify },
    } as unknown as PickerCommandHost;

    reorderWithinScope.mockResolvedValue({ ok: false, reason });

    await new pickerCommandsClass(host).reorder(1);

    expect(notify).toHaveBeenCalledWith(reason, "error");
    expect(refreshPresets).not.toHaveBeenCalled();
  });
});
