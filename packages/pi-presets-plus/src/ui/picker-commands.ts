/**
 * Runs the dialog flows behind the picker's action keys: new, edit,
 * duplicate, delete, reorder, clear, and status.
 */
import { clearReturning } from "../activation/clear.js";
import type { ActivationResult } from "../activation/request.js";
import type { ActivePresetSession } from "../activation/session.js";
import { formatStatusBody } from "../commands/presets/status.js";
import type { HotkeyRegistry } from "../hotkey-registry.js";
import { removePreset, reorderWithinScope } from "../store/api.js";
import type { LoadedPreset } from "../types.js";
import { renderClearSummary } from "./clear-summary.js";
import { appendReportWarnings } from "./command-report.js";
import { openConfirm } from "./confirm.js";
import { openEditor } from "./editor.js";
import { openInfoDialog } from "./info-dialog.js";
import {
  CLEAR_DIALOG_TITLE,
  CLEAR_LABEL,
  DELETE_LABEL,
  DUPLICATE_LABEL,
  EDIT_LABEL,
  NEW_LABEL,
  STATUS_ACTION_LABEL,
  STATUS_DIALOG_TITLE,
} from "./labels.js";
import { loadedPresetKey } from "./picker-state.js";
import { serializeForCopy, uniqueCopyName } from "./preset-copy.js";
import { confirmReload, reloadAfterOverlayClose } from "./reload-prompt.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { styleReport } from "@sherif-fanous/pi-extensions-core";

/** One action key, its footer label, and the command it runs. */
export interface PickerAction {
  /** Busy line the footer shows while the command runs. */
  readonly busy: string;
  readonly key: string;
  readonly label: string;
  /** Whether the command acts on the selected preset. */
  readonly needsSelection: boolean;
  run(commands: PickerCommands): Promise<void>;
}

/**
 * Surface the picker exposes to its action-key commands.
 *
 * Commands run against this interface, so a test can drive them without
 * instantiating the live picker component.
 */
export interface PickerCommandHost {
  readonly ctx: ExtensionCommandContext;
  readonly pi: ExtensionAPI | undefined;
  readonly ui: Pick<ExtensionUIContext, "notify">;
  readonly theme: Theme;
  readonly hotkeys: HotkeyRegistry;
  readonly session: ActivePresetSession;
  /** Snapshot of the loaded preset list at the time of the call. */
  getAllPresets(): readonly LoadedPreset[];
  /** Currently selected preset, honoring the active filter and scope. */
  currentSelection(): LoadedPreset | undefined;
  /** Hide the picker overlay while a nested dialog runs. */
  runWithHiddenOverlay<T>(fn: () => Promise<T>): Promise<T>;
  /** Apply a preset (used by the editor's Test button as a passthrough). */
  onActivate(preset: LoadedPreset): Promise<ActivationResult>;
  /** Reload presets from disk and re-focus on `selectionKey`, if given. */
  refreshPresets(selectionKey?: string): Promise<void>;
  /** Close the picker; pass an `activated` payload when a preset was applied. */
  finish(result: { activated?: LoadedPreset } | undefined): void;
}

/**
 * Action keys that operate on the selected preset, in footer order.
 *
 * The picker wires Enter, Esc, Ctrl+↑↓, and `/` directly into its own
 * dispatch and footer, so they do not appear here.
 */
export const PICKER_ACTIONS: readonly PickerAction[] = [
  {
    busy: "Opening the editor…",
    key: "n",
    label: NEW_LABEL,
    needsSelection: false,
    run: (commands) => commands.openEditorForNew(),
  },
  {
    busy: "Opening the editor…",
    key: "e",
    label: EDIT_LABEL,
    needsSelection: true,
    run: (commands) => commands.openEditorForSelection(),
  },
  {
    busy: "Opening the editor…",
    key: "d",
    label: DUPLICATE_LABEL,
    needsSelection: true,
    run: (commands) => commands.duplicate(),
  },
  {
    busy: "Deleting the preset…",
    key: "x",
    label: DELETE_LABEL,
    needsSelection: true,
    run: (commands) => commands.delete(),
  },
  {
    busy: "Clearing the active preset…",
    key: "c",
    label: CLEAR_LABEL,
    needsSelection: false,
    run: (commands) => commands.clearActive(),
  },
  {
    busy: "Loading the status…",
    key: "s",
    label: STATUS_ACTION_LABEL,
    needsSelection: false,
    run: (commands) => commands.showStatus(),
  },
];

/** Action-key commands bound to one picker host. */
export class PickerCommands {
  constructor(private readonly host: PickerCommandHost) {}

  /** Confirm, then clear the active preset and show the restore summary. */
  async clearActive(): Promise<void> {
    const { ctx, pi, session, theme } = this.host;

    if (!pi) {
      await this.showUnavailableDialog("Clear Unavailable");

      return;
    }

    if (!session.current()) {
      await this.host.runWithHiddenOverlay(() =>
        openInfoDialog(ctx, {
          body: "No preset is active.",
          title: "Clear Unavailable",
        }),
      );

      return;
    }

    const confirmed = await this.host.runWithHiddenOverlay(() =>
      openConfirm(
        ctx,
        "Clear Active Preset?",
        "Clear the active preset and restore managed settings?",
      ),
    );

    if (!confirmed) return;

    const result = await clearReturning(ctx, pi, session);

    if (result) {
      await this.host.runWithHiddenOverlay(() =>
        openInfoDialog(ctx, {
          body: reportDialogBody(
            renderClearSummary(result.name, result.parts),
            theme,
            result.parts.some(
              (part) =>
                part.action === "restore-failed" ||
                part.action === "restored-partial",
            )
              ? "warning"
              : "info",
          ),
          title: CLEAR_DIALOG_TITLE,
        }),
      );
    }

    await this.host.refreshPresets();
  }

  /** Confirm, then remove the selected preset, offering a reload if needed. */
  async delete(): Promise<void> {
    await this.confirmAndActOnSelection(
      (preset) => ({
        title: `Delete "${preset.name}"?`,
        message: `Remove preset "${preset.name}" from ${preset.scope} scope?`,
      }),
      async (preset) => {
        const result = await removePreset(
          preset.name,
          preset.scope,
          this.host.ctx,
        );

        if (!result.ok) {
          this.host.ui.notify(result.reason, "error");

          return;
        }

        if (this.host.hotkeys.deleteNeedsReload(preset)) {
          const reloadRequested = await this.host.runWithHiddenOverlay(() =>
            confirmReload(this.host.ctx),
          );

          if (reloadRequested) {
            this.host.finish(undefined);
            reloadAfterOverlayClose(this.host.ctx);

            return;
          }

          this.host.hotkeys.recordReloadPromptDeclined(preset, undefined);
        }

        await this.host.refreshPresets(loadedPresetKey(preset));
      },
    );
  }

  /** Open the editor on a copy of the selected preset. */
  async duplicate(): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    const scopedNames = this.host
      .getAllPresets()
      .filter((candidate) => candidate.scope === preset.scope)
      .map((candidate) => candidate.name);
    const copyName = uniqueCopyName(preset.name, scopedNames);
    const copy = serializeForCopy(preset, copyName);
    // The seed carries only the source scope. Load-time metadata
    // (`shadowed`, `unavailable`) is dropped so the editor recomputes
    // availability for the copy instead of inheriting stale flags.
    const seed: LoadedPreset = { ...copy, scope: preset.scope };

    await this.openEditorAndDispatch({
      mode: "duplicate",
      seed,
      source: preset,
    });
  }

  /** Open the editor on a blank preset form. */
  async openEditorForNew(): Promise<void> {
    await this.openEditorAndDispatch({ mode: "new" });
  }

  /** Open the editor on the selected preset. */
  async openEditorForSelection(): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    await this.openEditorAndDispatch({
      mode: "edit",
      seed: preset,
      target: preset,
    });
  }

  /** Move the selected preset one slot within its own scope. */
  async reorder(direction: -1 | 1): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    const scopedPresets = this.host
      .getAllPresets()
      .filter((candidate) => candidate.scope === preset.scope);
    const index = scopedPresets.findIndex(
      (candidate) => candidate.name === preset.name,
    );
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= scopedPresets.length) return;

    const ordered = [...scopedPresets];
    const current = ordered[index];
    const next = ordered[nextIndex];

    if (!current || !next) return;

    ordered[index] = next;
    ordered[nextIndex] = current;

    const result = await reorderWithinScope(
      preset.scope,
      ordered.map((candidate) => candidate.name),
      this.host.ctx,
    );

    if (!result.ok) {
      this.host.ui.notify(result.reason, "error");

      return;
    }

    await this.host.refreshPresets(loadedPresetKey(preset));
  }

  /** Show the status report for the active preset in an overlay. */
  async showStatus(): Promise<void> {
    const { ctx, pi, session } = this.host;

    if (!pi) {
      await this.showUnavailableDialog("Status Unavailable");

      return;
    }

    const result = await formatStatusBody(ctx, pi, session);

    await this.host.runWithHiddenOverlay(() =>
      openInfoDialog(ctx, {
        body: reportDialogBody(
          appendReportWarnings(result.body, result.warnings),
          this.host.theme,
          result.severity,
        ),
        title: STATUS_DIALOG_TITLE,
      }),
    );
  }

  /**
   * Resolve the selection, confirm with caller-supplied copy, and run
   * `action` on yes. An empty selection or a cancelled confirm does
   * nothing, which keeps each call site flat.
   */
  private async confirmAndActOnSelection(
    messages: (preset: LoadedPreset) => { title: string; message: string },
    action: (preset: LoadedPreset) => Promise<void>,
  ): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    const { title, message } = messages(preset);
    const confirmed = await this.host.runWithHiddenOverlay(() =>
      openConfirm(this.host.ctx, title, message),
    );

    if (!confirmed) return;

    await action(preset);
  }

  /**
   * Hide the picker, open the editor with the given seed, and route the
   * result. A `saved` payload refreshes the list with the saved preset
   * focused. A `tested` payload closes the picker and reports the
   * candidate as `activated`, so the outer notification names the preset
   * the user tested.
   */
  private async openEditorAndDispatch(
    openOptions: Parameters<typeof openEditor>[1],
  ): Promise<void> {
    const result = await this.host.runWithHiddenOverlay(() =>
      openEditor(this.host.ctx, openOptions, {
        onReloadRequested: () => {
          this.host.finish(undefined);
          reloadAfterOverlayClose(this.host.ctx);
        },
        onTest: (candidate) =>
          this.host.onActivate({
            ...candidate,
            unavailable: undefined,
          }),
        pi: this.host.pi,
        hotkeys: this.host.hotkeys,
        presets: this.host.getAllPresets(),
        session: this.host.session,
      }),
    );

    if (result?.saved) {
      if (result.reloadRequested) return;

      await this.host.refreshPresets(loadedPresetKey(result.saved));
    }

    if (result?.tested) this.host.finish({ activated: result.tested });
  }

  private async showUnavailableDialog(title: string): Promise<void> {
    await this.host.runWithHiddenOverlay(() =>
      openInfoDialog(this.host.ctx, {
        body: this.host.theme.fg(
          "warning",
          "Pi did not provide the API needed for this action.",
        ),
        title,
      }),
    );
  }
}

/**
 * A command report as an info-dialog body: styled like the transcript
 * report, without the heading line the dialog title already shows, and
 * dedented to the frame's padding. A `warning` report colors its first
 * line, so the problem shows without the heading.
 */
function reportDialogBody(
  report: string,
  theme: Pick<Theme, "bold" | "fg">,
  severity: "info" | "warning",
): string {
  const lines = styleReport(report, theme).split("\n").slice(1);
  const indent = Math.min(
    ...lines
      .filter((line) => line.trim().length > 0)
      .map((line) => line.length - line.trimStart().length),
  );
  const body = lines.map((line) =>
    line.slice(Number.isFinite(indent) ? indent : 0),
  );

  if (severity === "warning" && body[0] !== undefined) {
    body[0] = theme.fg("warning", body[0]);
  }

  return body.join("\n");
}
