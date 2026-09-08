/** Implements the focused, framed theme sync configuration overlay. */

import {
  isValidPollIntervalMs,
  POLL_INTERVAL_MAX_MS,
  POLL_INTERVAL_MIN_MS,
} from "../config.js";
import type {
  ConfigScope,
  ConfigSource,
  EditableConfigChanges,
  LoadedRuntimeConfig,
} from "../types.js";
import {
  fitLines,
  frameLine,
  frameSegment,
  padToWidth,
  wrapToWidth,
} from "./frame.js";
import {
  getSelectListTheme,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  matchesKey,
  SelectList,
  visibleWidth,
  type Component,
  type Focusable,
  type SelectItem,
} from "@earendil-works/pi-tui";

/** Inputs and I/O callbacks used by the configuration overlay. */
export interface ConfigOverlayOptions {
  readonly config: LoadedRuntimeConfig;
  readonly done: () => void;
  readonly resolvePaths: () => Promise<Record<ConfigScope, string>>;
  readonly requestRender: () => void;
  readonly save: (
    scope: ConfigScope,
    changes: EditableConfigChanges,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly terminalRows: () => number;
  readonly theme: Theme;
  readonly themeNames: readonly string[];
}

/** Semantic severity for an inline configuration message. */
export type ConfigMessageSeverity = "success" | "error" | "warning";
type ConfigMode =
  | { kind: "config" }
  | { kind: "themeSelect"; fieldId: ThemeField }
  | { kind: "syncSelect" }
  | { kind: "pollIntervalEdit"; error?: string }
  | { kind: "writeTarget"; paths: Record<ConfigScope, string> };
type DraftConfig = Record<keyof EditableConfigChanges, string>;

type ThemeField = "themes.light" | "themes.dark";

/** Focused component that edits and saves a theme sync configuration draft. */
export class ConfigOverlayComponent implements Component, Focusable {
  private _focused = false;
  private readonly current: DraftConfig;
  private readonly desired: DraftConfig;
  private mode: ConfigMode = { kind: "config" };
  private message:
    { text: string; severity: ConfigMessageSeverity } | undefined;
  private activeList: SelectList | undefined;
  private listCapacity = 0;
  private readonly pollInput = new Input();
  private isBusy = false;
  private reloadAfterClose = false;

  constructor(private readonly options: ConfigOverlayOptions) {
    const runtime = options.config.runtimeConfig;

    this.current = {
      "themes.light": runtime.themes.light,
      "themes.dark": runtime.themes.dark,
      "detection.pollIntervalMs": String(runtime.detection.pollIntervalMs),
      isSyncActive: runtime.isSyncActive ? "active" : "inactive",
    };
    this.desired = { ...this.current };
    this.rebuildList();
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.syncInputFocus();
  }

  /** Whether the caller should reload after this overlay has closed. */
  get reloadRequested(): boolean {
    return this.reloadAfterClose;
  }

  handleInput(data: string): void {
    if (this.isBusy) return;

    if (matchesKey(data, Key.ctrl("c"))) {
      this.options.done();

      return;
    }

    if (this.mode.kind === "pollIntervalEdit") {
      this.pollInput.handleInput(data);
      this.options.requestRender();

      return;
    }

    if (this.mode.kind === "config" && matchesKey(data, Key.ctrl("s"))) {
      void this.openWriteTarget();

      return;
    }

    if (this.mode.kind === "config" && matchesKey(data, Key.ctrl("r"))) {
      this.reloadAfterClose = true;
      this.options.done();

      return;
    }

    this.activeList?.handleInput(data);
    this.options.requestRender();
  }

  invalidate(): void {
    this.activeList?.invalidate();
    this.pollInput.invalidate();
  }

  render(width: number): string[] {
    const frameWidth = Math.max(0, width);

    if (frameWidth === 0) return [];

    const innerWidth = Math.max(1, frameWidth - 2);
    const bodyBudget = this.bodyRowBudget();
    const nextCapacity = this.listCapacityForBody(innerWidth, bodyBudget);

    if (this.isListMode() && nextCapacity !== this.listCapacity) {
      this.rebuildList(nextCapacity);
    }

    const body = this.renderBody(innerWidth, bodyBudget);
    const title = this.options.theme.fg(
      "accent",
      this.options.theme.bold(this.title()),
    );
    const titleSegment = `─ ${title} `;
    const top =
      frameWidth <= 2
        ? frameSegment("┌", "─", "┐", frameWidth)
        : `┌${padToWidth(titleSegment, frameWidth - 2, "─", "─")}┐`;
    const lines = [
      top,
      ...body.map((line) => frameLine(line, frameWidth)),
      frameSegment("├", "─", "┤", frameWidth),
      frameLine(this.options.theme.fg("dim", ` ${this.footer()}`), frameWidth),
      frameSegment("└", "─", "┘", frameWidth),
    ];

    return fitLines(lines, frameWidth);
  }

  private bodyRowBudget(): number {
    const frameRows = Math.max(
      4,
      Math.floor(this.options.terminalRows() * 0.9),
    );

    return frameRows - 4;
  }

  private buildConfigItems(): SelectItem[] {
    const sources = this.options.config.runtimeConfigSources;

    return [
      {
        value: "themes.light",
        label: "Light Mode Theme",
        description: `${this.desired["themes.light"]} [${formatSource(sources.themes.light)}]`,
      },
      {
        value: "themes.dark",
        label: "Dark Mode Theme",
        description: `${this.desired["themes.dark"]} [${formatSource(sources.themes.dark)}]`,
      },
      {
        value: "detection.pollIntervalMs",
        label: "Polling Interval",
        description: `${this.desired["detection.pollIntervalMs"]}ms [${formatSource(sources.detection.pollIntervalMs)}]`,
      },
      {
        value: "isSyncActive",
        label: "Sync Status",
        description: `${this.desired.isSyncActive} [${formatSource(sources.isSyncActive)}]`,
      },
    ];
  }

  private buildList(items: SelectItem[], capacity: number): SelectList {
    const previous = this.activeList?.getSelectedItem()?.value;
    const list = new SelectList(
      items,
      Math.max(1, Math.min(items.length, capacity)),
      getSelectListTheme(),
    );
    const selectedIndex = items.findIndex((item) => item.value === previous);

    if (selectedIndex >= 0) list.setSelectedIndex(selectedIndex);

    return list;
  }

  private changes(): EditableConfigChanges {
    const changes: EditableConfigChanges = {};

    if (this.desired["themes.light"] !== this.current["themes.light"]) {
      changes["themes.light"] = this.desired["themes.light"];
    }

    if (this.desired["themes.dark"] !== this.current["themes.dark"]) {
      changes["themes.dark"] = this.desired["themes.dark"];
    }

    if (
      this.desired["detection.pollIntervalMs"] !==
      this.current["detection.pollIntervalMs"]
    ) {
      changes["detection.pollIntervalMs"] = Number(
        this.desired["detection.pollIntervalMs"],
      );
    }

    if (this.desired.isSyncActive !== this.current.isSyncActive) {
      changes.isSyncActive = this.desired.isSyncActive === "active";
    }

    return changes;
  }

  private footer(): string {
    switch (this.mode.kind) {
      case "config":
        return "↑/↓ Move · Enter Edit · Ctrl+S Save · Ctrl+R Reload · Esc Close · Ctrl+C Quit";
      case "pollIntervalEdit":
        return "Enter Confirm · Esc Cancel · Ctrl+C Quit";
      case "writeTarget":
        return "↑/↓ Navigate · Enter Save · Esc Back · Ctrl+C Quit";
      default:
        return "↑/↓ Navigate · Enter Select · Esc Back · Ctrl+C Quit";
    }
  }

  private isListMode(): boolean {
    return this.mode.kind !== "pollIntervalEdit";
  }

  private listCapacityForBody(width: number, budget: number): number {
    const listBudget = Math.max(
      0,
      budget - this.messageRowBudget(width, budget),
    );
    const itemCount = this.listItemCount();

    if (itemCount <= listBudget) return Math.max(1, itemCount);

    return Math.max(1, listBudget - 1);
  }

  private listItemCount(): number {
    switch (this.mode.kind) {
      case "config":
        return 4;
      case "themeSelect":
        return this.options.themeNames.length;
      case "syncSelect":
      case "writeTarget":
        return 2;
      case "pollIntervalEdit":
        return 0;
    }
  }

  private messageRowBudget(width: number, budget: number): number {
    if (!this.message || budget <= 0) return 0;

    const messageRows = this.styledMessage(
      this.message.text,
      this.message.severity,
      width,
    ).length;
    const minimumListRows = Math.min(budget, this.listItemCount() > 1 ? 2 : 1);
    const available = budget - minimumListRows;

    if (available <= 0) return Math.min(1, budget);

    return Math.min(messageRows + 1, Math.max(1, available));
  }

  private openPollEditor(): void {
    this.pollInput.setValue(this.desired["detection.pollIntervalMs"]);
    this.pollInput.handleInput("\x1b[F");

    this.pollInput.onSubmit = (value) => {
      const parsed = Number(value);

      if (!isValidPollIntervalMs(parsed)) {
        this.mode = {
          kind: "pollIntervalEdit",
          error: `Polling interval must be between ${POLL_INTERVAL_MIN_MS} and ${POLL_INTERVAL_MAX_MS} milliseconds.`,
        };
        this.options.requestRender();

        return;
      }

      this.desired["detection.pollIntervalMs"] = String(Math.floor(parsed));
      this.setMode({ kind: "config" });
    };

    this.pollInput.onEscape = () => this.setMode({ kind: "config" });
    this.setMode({ kind: "pollIntervalEdit" });
  }

  private async openWriteTarget(): Promise<void> {
    this.isBusy = true;
    this.message = {
      text: "Resolving configuration paths.",
      severity: "warning",
    };
    this.options.requestRender();

    try {
      const paths = await this.options.resolvePaths();

      this.message = undefined;
      this.setMode({ kind: "writeTarget", paths });
    } catch (error) {
      this.message = {
        text: `Error resolving config paths: ${(error as Error).message}.`,
        severity: "error",
      };
      this.setMode({ kind: "config" });
    } finally {
      this.isBusy = false;
      this.options.requestRender();
    }
  }

  private rebuildList(capacity = 4): void {
    this.listCapacity = capacity;

    switch (this.mode.kind) {
      case "config": {
        const list = this.buildList(this.buildConfigItems(), capacity);

        list.onCancel = () => this.options.done();

        list.onSelect = (item) => {
          if (item.value === "themes.light" || item.value === "themes.dark") {
            this.setMode({ kind: "themeSelect", fieldId: item.value });
          } else if (item.value === "detection.pollIntervalMs") {
            this.openPollEditor();
          } else {
            this.setMode({ kind: "syncSelect" });
          }
        };

        this.activeList = list;

        break;
      }

      case "themeSelect": {
        const items = this.options.themeNames.map((name) => ({
          value: name,
          label: name,
        }));
        const list = this.buildList(items, capacity);
        const currentIndex = items.findIndex(
          (item) =>
            item.value ===
            this.desired[
              this.mode.kind === "themeSelect"
                ? this.mode.fieldId
                : "themes.light"
            ],
        );

        if (this.activeList === undefined && currentIndex >= 0) {
          list.setSelectedIndex(currentIndex);
        }

        list.onCancel = () => this.setMode({ kind: "config" });

        list.onSelect = (item) => {
          if (this.mode.kind !== "themeSelect") return;
          this.desired[this.mode.fieldId] = item.value;
          this.setMode({ kind: "config" });
        };

        this.activeList = list;

        break;
      }

      case "syncSelect": {
        const items = [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ];
        const list = this.buildList(items, capacity);

        list.setSelectedIndex(this.desired.isSyncActive === "active" ? 0 : 1);
        list.onCancel = () => this.setMode({ kind: "config" });

        list.onSelect = (item) => {
          this.desired.isSyncActive = item.value;
          this.setMode({ kind: "config" });
        };

        this.activeList = list;

        break;
      }

      case "writeTarget": {
        const items = [
          { value: "project", label: `Project (${this.mode.paths.project})` },
          { value: "global", label: `Global (${this.mode.paths.global})` },
        ];
        const list = this.buildList(items, capacity);

        list.onCancel = () => this.setMode({ kind: "config" });
        list.onSelect = (item) => void this.save(item.value as ConfigScope);
        this.activeList = list;

        break;
      }

      case "pollIntervalEdit":
        this.activeList = undefined;
    }
  }

  private renderBody(width: number, budget: number): string[] {
    if (this.mode.kind === "pollIntervalEdit") {
      return this.renderPollEditorBody(width, budget);
    }

    const messageBudget = this.messageRowBudget(width, budget);
    const listBudget = Math.max(0, budget - messageBudget);
    const listLines = (this.activeList?.render(Math.max(1, width - 2)) ?? [])
      .slice(0, listBudget)
      .map((line) => ` ${line}`);

    return [...listLines, ...this.renderMessage(width, messageBudget)].slice(
      0,
      budget,
    );
  }

  private renderMessage(width: number, budget: number): string[] {
    if (!this.message || budget <= 0) return [];

    const lines = this.styledMessage(
      this.message.text,
      this.message.severity,
      width,
    );

    return budget === 1
      ? lines.slice(0, 1)
      : ["", ...lines.slice(0, budget - 1)];
  }

  private renderPollEditorBody(width: number, budget: number): string[] {
    if (budget <= 0 || this.mode.kind !== "pollIntervalEdit") return [];

    const errorMessage = this.mode.error;
    const instruction = wrapToWidth(
      `Enter milliseconds (${POLL_INTERVAL_MIN_MS} to ${POLL_INTERVAL_MAX_MS}, inclusive).`,
      Math.max(1, width - 1),
    ).map((line) => ` ${line}`);
    const input = this.pollInput
      .render(Math.max(1, width - 2))
      .map((line) => ` ${line}`);

    if (!errorMessage) {
      const preferred = ["", ...instruction, "", ...input];

      if (preferred.length <= budget) return preferred;

      return [...instruction.slice(0, Math.max(0, budget - 1)), ...input].slice(
        -budget,
      );
    }

    const error = this.styledMessage(errorMessage, "error", width);
    const preferred = ["", ...instruction, "", ...input, "", ...error];

    if (preferred.length <= budget) return preferred;
    if (budget === 1) return input.slice(0, 1);

    const instructionBudget = Math.min(instruction.length, budget - 2);
    const errorBudget = budget - instructionBudget - 1;

    return [
      ...instruction.slice(0, instructionBudget),
      ...input.slice(0, 1),
      ...error.slice(0, errorBudget),
    ];
  }

  private async save(scope: ConfigScope): Promise<void> {
    if (this.isBusy) return;

    const submitted = { ...this.desired };
    const changes = this.changes();
    const count = Object.keys(changes).length;

    this.isBusy = true;
    this.message = { text: "Saving configuration.", severity: "warning" };
    this.setMode({ kind: "config" });

    try {
      const result = await this.options.save(scope, changes);

      if (!result.ok) {
        this.message = { text: result.reason, severity: "error" };

        return;
      }

      Object.assign(this.current, submitted);
      this.message = {
        text:
          count === 0
            ? "No changes to save."
            : `Saved ${String(count)} changed setting(s) to ${scope === "project" ? "Project" : "Global"}.`,
        severity: count === 0 ? "warning" : "success",
      };
    } catch (error) {
      this.message = {
        text: `Error saving config: ${(error as Error).message}.`,
        severity: "error",
      };
    } finally {
      this.isBusy = false;
      this.rebuildList();
      this.options.requestRender();
    }
  }

  private setMode(mode: ConfigMode): void {
    this.mode = mode;
    this.activeList = undefined;
    this.rebuildList();
    this.syncInputFocus();
    this.options.requestRender();
  }

  private styledMessage(
    text: string,
    severity: ConfigMessageSeverity,
    width: number,
  ): string[] {
    const indent = "  ";
    const bodyWidth = Math.max(1, width - visibleWidth(indent));

    return wrapToWidth(text, bodyWidth).map((line) =>
      this.options.theme.fg(severity, `${indent}${line}`),
    );
  }

  private syncInputFocus(): void {
    this.pollInput.focused =
      this._focused && this.mode.kind === "pollIntervalEdit";
  }

  private title(): string {
    switch (this.mode.kind) {
      case "config":
        return "Theme Sync Config";
      case "themeSelect":
        return this.mode.fieldId === "themes.light"
          ? "Light Mode Theme"
          : "Dark Mode Theme";
      case "syncSelect":
        return "Sync Status";
      case "pollIntervalEdit":
        return "Polling Interval";
      case "writeTarget":
        return "Write Config To";
    }
  }
}

function formatSource(source: ConfigSource): string {
  switch (source) {
    case "project":
      return "Project";
    case "global":
      return "Global";
    case "default":
      return "Default";
  }
}
