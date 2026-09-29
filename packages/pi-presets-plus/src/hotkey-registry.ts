/**
 * Registers the keys the hotkey rules assign as session shortcuts, and
 * tracks which bindings are live so the editor can tell when a preset
 * change needs a reload to take effect.
 */
import { activate } from "./activation/activate.js";
import type { ActivePresetSession } from "./activation/session.js";
import { EXTENSION_NAME } from "./extension-name.js";
import { analyzeHotkeys, hotkeyChanged } from "./hotkey-rules.js";
import type { PresetIdentity } from "./preset-identity.js";
import type { LoadedPreset } from "./types.js";
import { reportWarnings } from "./warnings.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import { describeErrorSentence } from "@sherif-fanous/pi-extensions-core";

/**
 * Tracks the hotkeys bound in the running session and the pending hotkey
 * changes the user already declined to reload for.
 */
export class HotkeyRegistry {
  private readonly acknowledgedPendingHotkeys = new Map<
    string,
    string | undefined
  >();
  /** Hotkeys bound at session start, keyed by preset identity. */
  private readonly runtimeHotkeys = new Map<
    string,
    { readonly hotkey: string | undefined; readonly name: string }
  >();

  /**
   * Bind session-start shortcuts and capture the runtime hotkey baseline.
   *
   * Hotkey warnings go into `warnings` when the caller collects them, and
   * otherwise out as one warning notification.
   */
  bindForSession(
    presets: readonly LoadedPreset[],
    ctx: Pick<ExtensionContext, "ui">,
    pi: ExtensionAPI,
    session: ActivePresetSession,
    warnings?: string[],
  ): void {
    const { bindings, warnings: hotkeyWarnings } = analyzeHotkeys(presets);

    this.setRuntimeHotkeyBaseline(presets);

    for (const { key, name, scope } of bindings) {
      pi.registerShortcut(key as KeyId, {
        description: `Activate preset "${name}"`,
        handler: async (handlerCtx) => {
          try {
            await activate(handlerCtx, pi, session, {
              name,
              scope,
              trigger: "hotkey",
            });
          } catch (err) {
            handlerCtx.ui.notify(
              `${EXTENSION_NAME} hotkey for preset "${name}" failed: ${describeErrorSentence(err)}`,
              "error",
            );
          }
        },
      });
    }

    reportWarnings(ctx, hotkeyWarnings, warnings);
  }

  /**
   * Name the presets whose hotkey in `presets` differs from the one bound
   * at session start, including bound presets that no longer exist. Pi
   * reads extension shortcuts only while it binds a session, so these
   * changes need `/reload`.
   */
  changedHotkeyNames(presets: readonly LoadedPreset[]): string[] {
    const names = new Set<string>();
    const current = new Set(presets.map((preset) => presetKey(preset)));

    for (const preset of presets) {
      if (!this.runtimeMatches(preset, preset.hotkey)) names.add(preset.name);
    }

    for (const [key, runtime] of this.runtimeHotkeys) {
      if (!current.has(key) && hotkeyChanged(runtime.hotkey, undefined)) {
        names.add(runtime.name);
      }
    }

    return [...names];
  }

  /** Return whether deleting `identity` leaves runtime bindings out of date. */
  deleteNeedsReload(identity: PresetIdentity): boolean {
    return this.commitNeedsHotkeyReload(identity, undefined);
  }

  /** Remember a declined prompt so the same pending state is not re-prompted. */
  recordReloadPromptDeclined(
    identity: PresetIdentity & { readonly hotkey?: string | undefined },
    hotkey = identity.hotkey,
  ): void {
    this.acknowledgedPendingHotkeys.set(presetKey(identity), hotkey);
  }

  /** Return whether saving `saved` leaves runtime bindings out of date. */
  saveNeedsReload(
    initial: PresetIdentity | undefined,
    saved: PresetIdentity & { readonly hotkey?: string | undefined },
  ): boolean {
    if (!this.commitNeedsHotkeyReload(saved, saved.hotkey)) return false;

    const initialRuntimeHotkey = this.runtimeHotkeyFor(initial);

    if (!hotkeyChanged(initialRuntimeHotkey, saved.hotkey)) {
      return (
        Boolean(initialRuntimeHotkey?.trim()) && identityChanged(initial, saved)
      );
    }

    return true;
  }

  private acknowledgedPendingHotkeyMatches(
    identity: PresetIdentity & { readonly hotkey?: string | undefined },
  ): boolean {
    if (!this.acknowledgedPendingHotkeys.has(presetKey(identity))) return false;

    return !hotkeyChanged(
      this.acknowledgedPendingHotkeys.get(presetKey(identity)),
      identity.hotkey,
    );
  }

  private commitNeedsHotkeyReload(
    identity: PresetIdentity,
    hotkey: string | undefined,
  ): boolean {
    if (this.runtimeMatches(identity, hotkey)) {
      this.acknowledgedPendingHotkeys.delete(presetKey(identity));

      return false;
    }

    return !this.acknowledgedPendingHotkeyMatches({ ...identity, hotkey });
  }

  private runtimeHotkeyFor(
    identity: PresetIdentity | undefined,
  ): string | undefined {
    if (!identity) return undefined;

    return this.runtimeHotkeys.get(presetKey(identity))?.hotkey;
  }

  private runtimeMatches(
    identity: PresetIdentity,
    hotkey: string | undefined,
  ): boolean {
    return !hotkeyChanged(this.runtimeHotkeyFor(identity), hotkey);
  }

  private setRuntimeHotkeyBaseline(presets: readonly LoadedPreset[]): void {
    this.acknowledgedPendingHotkeys.clear();
    this.runtimeHotkeys.clear();

    for (const preset of presets) {
      this.runtimeHotkeys.set(presetKey(preset), {
        hotkey: preset.hotkey,
        name: preset.name,
      });
    }
  }
}

function identityChanged(
  prev: PresetIdentity | undefined,
  next: PresetIdentity,
): boolean {
  if (!prev) return false;

  return prev.name !== next.name || prev.scope !== next.scope;
}

function presetKey(identity: PresetIdentity): string {
  return `${identity.scope}:${identity.name}`;
}
