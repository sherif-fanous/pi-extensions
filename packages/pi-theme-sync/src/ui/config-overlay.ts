/** Implements the framed Theme Sync configuration form and its nested steps. */

import { CONFIG_LIMITS, isValidPollIntervalMs } from "../config/load.js";
import { EXTENSION_NAME } from "../extension-name.js";
import type {
  ConfigSource,
  EditableConfigChanges,
  LoadedRuntimeConfig,
} from "../types.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  matchesKey,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type KeybindingsManager,
} from "@earendil-works/pi-tui";
import {
  configScopeLabel,
  describeErrorSentence,
  emptyStateLines,
  frameBodyRows,
  frameBodyWidth,
  keyHint,
  listWindow,
  matchesHelpKey,
  matchSelectAction,
  moveListSelection,
  overlayMaxHeight,
  padToWidth,
  pluralize,
  renderFrame,
  scrollLines,
  wrapKeyHints,
  type ConfigScope,
  type SelectAction,
} from "@sherif-fanous/pi-extensions-core";

/** Inputs and I/O callbacks used by the configuration overlay. */
export interface ConfigOverlayOptions {
  readonly config: LoadedRuntimeConfig;
  readonly done: () => void;
  /** Pi's keybindings; list movement, confirm, and cancel follow them. */
  readonly keybindings: Pick<KeybindingsManager, "getKeys" | "matches">;
  readonly requestRender: () => void;
  /** Saves changes to one scope's file; throws when the save fails. */
  readonly save: (
    scope: ConfigScope,
    changes: EditableConfigChanges,
  ) => Promise<void>;
  readonly terminalRows: () => number;
  readonly theme: Theme;
  readonly themeNames: readonly string[];
}

/** One row of the configuration form. */
interface ConfigFieldInfo {
  /** Paragraphs the `F1 Help` step shows for the row. */
  readonly help: readonly string[];
  readonly id: ConfigField;
  /** Sentence-case row label. */
  readonly label: string;
  /** Title Case name for the row's nested step titles. */
  readonly title: string;
}

/** One row of a nested selection list. */
interface ListItem {
  readonly label: string;
  readonly value: string;
}

type ConfigField = keyof EditableConfigChanges;

/** Severity of an inline configuration message. */
type ConfigMessageSeverity = "error" | "info" | "success";

type ConfigMode =
  | { kind: "config" }
  | { kind: "help"; field: ConfigFieldInfo; maxOffset: number; offset: number }
  | { kind: "pollIntervalEdit"; error?: string }
  | { kind: "syncSelect" }
  | { kind: "themeSelect"; fieldId: ThemeField }
  | { kind: "writeTarget" };

type DraftConfig = Record<ConfigField, string>;

type ThemeField = "themes.light" | "themes.dark";

const POLL_INTERVAL_LIMITS = CONFIG_LIMITS["detection.pollIntervalMs"];

const SOURCE_HELP =
  "The tag after each value shows where it comes from: Default, User, or Project.";
const APPLY_HELP =
  "Press Ctrl+S to save your changes to the User or Project configuration, then Ctrl+R to reload Pi and apply them.";

const CONFIG_FIELDS: readonly ConfigFieldInfo[] = [
  {
    help: [
      "The Pi theme Theme Sync applies while your terminal or system is in light mode.",
      "Press Enter to choose one of the installed themes.",
      SOURCE_HELP,
      APPLY_HELP,
    ],
    id: "themes.light",
    label: "Light mode theme",
    title: "Light Mode Theme",
  },
  {
    help: [
      "The Pi theme Theme Sync applies while your terminal or system is in dark mode.",
      "Press Enter to choose one of the installed themes.",
      SOURCE_HELP,
      APPLY_HELP,
    ],
    id: "themes.dark",
    label: "Dark mode theme",
    title: "Dark Mode Theme",
  },
  {
    help: [
      "How often, in milliseconds, Theme Sync checks the appearance when your terminal cannot report changes itself. When it can, this is how often Theme Sync checks that Pi still shows the matching theme.",
      `Press Enter to type a value from ${String(POLL_INTERVAL_LIMITS.min)} to ${String(POLL_INTERVAL_LIMITS.max)}.`,
      SOURCE_HELP,
      APPLY_HELP,
    ],
    id: "detection.pollIntervalMs",
    label: "Polling interval",
    title: "Polling Interval",
  },
  {
    help: [
      "On switches Pi's theme to match the appearance. Off leaves the current theme alone.",
      "Press Enter to choose on or off.",
      SOURCE_HELP,
      APPLY_HELP,
    ],
    id: "syncEnabled",
    label: "Sync",
    title: "Sync",
  },
];

/** Label column width of the form rows: the longest label and a gap. */
const LABEL_COLUMN_WIDTH =
  Math.max(...CONFIG_FIELDS.map((field) => field.label.length)) + 2;

/** Focused component that edits and saves a theme sync configuration draft. */
export class ConfigOverlayComponent implements Component, Focusable {
  private _focused = false;
  /** Footer busy line while input waits on a save. */
  private busyText: string | undefined;
  private configIndex = 0;
  private readonly current: DraftConfig;
  private readonly desired: DraftConfig;
  private listIndex = 0;
  private message:
    { text: string; severity: ConfigMessageSeverity } | undefined;
  private mode: ConfigMode = { kind: "config" };
  /** Rows of the list or help text at the last render, for PgUp/PgDn. */
  private pageRows = 1;
  private readonly pollInput = new Input();
  private reloadAfterClose = false;

  constructor(private readonly options: ConfigOverlayOptions) {
    const runtime = options.config.runtimeConfig;

    this.current = {
      "themes.light": runtime.themes.light,
      "themes.dark": runtime.themes.dark,
      "detection.pollIntervalMs": String(runtime.detection.pollIntervalMs),
      syncEnabled: runtime.syncEnabled ? "on" : "off",
    };
    this.desired = { ...this.current };
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
    if (this.busyText !== undefined) return;

    switch (this.mode.kind) {
      case "pollIntervalEdit":
        this.pollInput.handleInput(data);

        break;
      case "help":
        this.handleHelpInput(this.mode, data);

        break;
      case "config":
        this.handleConfigInput(data);

        break;
      default:
        this.handleListInput(data);
    }

    this.options.requestRender();
  }

  invalidate(): void {
    this.pollInput.invalidate();
  }

  render(width: number): string[] {
    if (width <= 0) return [];

    const bodyWidth = frameBodyWidth(width);
    const height = overlayMaxHeight(this.options.terminalRows());
    const layout = (paging: boolean): string[] =>
      this.busyText === undefined
        ? wrapKeyHints(this.footerHints(paging), bodyWidth)
        : [this.busyText];
    const unpagedFooter = layout(false);
    const footer = this.overflows(
      bodyWidth,
      frameBodyRows(height, unpagedFooter.length),
    )
      ? layout(true)
      : unpagedFooter;
    const body = this.renderBody(
      bodyWidth,
      frameBodyRows(height, footer.length),
    );

    return renderFrame({
      body: body.lines,
      footer,
      theme: this.options.theme,
      title: this.title(),
      titleRight:
        body.position === undefined
          ? undefined
          : this.options.theme.fg("muted", body.position),
      width,
    });
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

    if (this.desired.syncEnabled !== this.current.syncEnabled) {
      changes.syncEnabled = this.desired.syncEnabled === "on";
    }

    return changes;
  }

  private confirmListItem(item: ListItem): void {
    switch (this.mode.kind) {
      case "themeSelect":
        this.desired[this.mode.fieldId] = item.value;
        this.setMode({ kind: "config" });

        break;
      case "syncSelect":
        this.desired.syncEnabled = item.value;
        this.setMode({ kind: "config" });

        break;
      case "writeTarget":
        void this.save(item.value as ConfigScope);

        break;
      default:
        break;
    }
  }

  private editField(field: ConfigFieldInfo): void {
    const { id } = field;

    if (id === "themes.light" || id === "themes.dark") {
      this.listIndex = Math.max(
        0,
        this.options.themeNames.indexOf(this.desired[id]),
      );
      this.setMode({ kind: "themeSelect", fieldId: id });
    } else if (id === "detection.pollIntervalMs") {
      this.openPollEditor();
    } else {
      this.listIndex = this.desired.syncEnabled === "on" ? 0 : 1;
      this.setMode({ kind: "syncSelect" });
    }
  }

  private footerHints(paging: boolean): (string | undefined)[] {
    const { keybindings } = this.options;
    const move = keyHint(
      keybindings,
      ["tui.select.up", "tui.select.down"],
      "Move",
    );
    const page = paging
      ? keyHint(
          keybindings,
          ["tui.select.pageUp", "tui.select.pageDown"],
          "Page",
        )
      : undefined;
    const confirm = (action: string): string | undefined =>
      keyHint(keybindings, "tui.select.confirm", action);
    const cancel = (action: string): string | undefined =>
      keyHint(keybindings, "tui.select.cancel", action);

    switch (this.mode.kind) {
      case "config":
        return [
          move,
          page,
          confirm("Edit"),
          "F1 Help",
          "Ctrl+S Save",
          "Ctrl+R Reload",
          cancel("Close"),
        ];
      case "help":
        return [
          paging
            ? keyHint(
                keybindings,
                ["tui.select.up", "tui.select.down"],
                "Scroll",
              )
            : undefined,
          page,
          cancel("Back"),
        ];
      case "pollIntervalEdit":
        return [
          keyHint(keybindings, "tui.input.submit", "Confirm"),
          cancel("Cancel"),
        ];
      case "writeTarget":
        return [move, page, confirm("Save"), cancel("Back")];
      default:
        return this.listItems().length === 0
          ? [cancel("Back")]
          : [move, page, confirm("Select"), cancel("Back")];
    }
  }

  private handleConfigInput(data: string): void {
    const field = CONFIG_FIELDS[this.configIndex];

    if (matchesHelpKey(data)) {
      if (field !== undefined) {
        this.setMode({ kind: "help", field, maxOffset: 0, offset: 0 });
      }

      return;
    }

    if (matchesKey(data, Key.ctrl("s"))) {
      this.message = undefined;
      this.listIndex = 0;
      this.setMode({ kind: "writeTarget" });

      return;
    }

    if (matchesKey(data, Key.ctrl("r"))) {
      this.reloadAfterClose = true;
      this.options.done();

      return;
    }

    const action = matchSelectAction(this.options.keybindings, data);

    if (action === "cancel") {
      this.options.done();
    } else if (action === "confirm") {
      if (field !== undefined) this.editField(field);
    } else if (action !== undefined) {
      this.configIndex = moveListSelection(
        this.configIndex,
        CONFIG_FIELDS.length,
        action,
        this.pageRows,
      );
    }
  }

  private handleHelpInput(
    mode: Extract<ConfigMode, { kind: "help" }>,
    data: string,
  ): void {
    const action = matchSelectAction(this.options.keybindings, data);
    const scrollBy: Partial<Record<SelectAction, number>> = {
      down: 1,
      pageDown: this.pageRows,
      pageUp: -this.pageRows,
      up: -1,
    };

    if (action === "cancel") {
      this.setMode({ kind: "config" });
    } else if (action !== undefined) {
      mode.offset = Math.max(
        0,
        Math.min(mode.maxOffset, mode.offset + (scrollBy[action] ?? 0)),
      );
    }
  }

  private handleListInput(data: string): void {
    const action = matchSelectAction(this.options.keybindings, data);
    const items = this.listItems();

    if (action === "cancel") {
      this.setMode({ kind: "config" });
    } else if (action === "confirm") {
      const item = items[this.listIndex];

      if (item !== undefined) this.confirmListItem(item);
    } else if (action !== undefined) {
      this.listIndex = moveListSelection(
        this.listIndex,
        items.length,
        action,
        this.pageRows,
      );
    }
  }

  /** The field's help paragraphs wrapped to `width`, one blank row apart. */
  private helpText(field: ConfigFieldInfo, width: number): string[] {
    return field.help.flatMap((paragraph, index) => [
      ...(index === 0 ? [] : [""]),
      ...wrapTextWithAnsi(paragraph, Math.max(1, width)),
    ]);
  }

  /** Rows a list gets in a body of `rows` rows, after the inline message. */
  private listRows(width: number, rows: number): number {
    return Math.max(1, rows - this.messageLines(width, rows).length);
  }

  private listItems(): readonly ListItem[] {
    switch (this.mode.kind) {
      case "themeSelect":
        return this.options.themeNames.map((name) => ({
          label: name,
          value: name,
        }));
      case "syncSelect":
        return [
          { label: "on", value: "on" },
          { label: "off", value: "off" },
        ];

      case "writeTarget": {
        const { files } = this.options.config;

        return [
          { label: `Project (${files.project.path})`, value: "project" },
          { label: `User (${files.user.path})`, value: "user" },
        ];
      }

      default:
        return [];
    }
  }

  /**
   * The inline message as body rows below a list, with a blank row above
   * it when there is room. The list keeps at least its focused row.
   */
  private messageLines(width: number, rows: number): string[] {
    if (!this.message) return [];

    const lines = this.styledMessage(
      this.message.text,
      this.message.severity,
      width,
    );
    const available = Math.max(0, Math.min(lines.length + 1, rows - 1));

    if (available === 0) return [];

    return available === 1
      ? lines.slice(0, 1)
      : ["", ...lines.slice(0, available - 1)];
  }

  private openPollEditor(): void {
    this.pollInput.setValue(this.desired["detection.pollIntervalMs"]);
    this.pollInput.handleInput("\x1b[F");

    this.pollInput.onSubmit = (value) => {
      const parsed = Number(value);

      if (!isValidPollIntervalMs(parsed)) {
        this.mode = {
          kind: "pollIntervalEdit",
          error: `Polling interval must be between ${String(POLL_INTERVAL_LIMITS.min)} and ${String(POLL_INTERVAL_LIMITS.max)} milliseconds.`,
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

  /**
   * Whether the current step's list or help text is taller than `rows`,
   * so the footer offers paging keys.
   */
  private overflows(width: number, rows: number): boolean {
    switch (this.mode.kind) {
      case "help":
        return this.helpText(this.mode.field, width).length > rows;
      case "pollIntervalEdit":
        return false;
      case "config":
        return CONFIG_FIELDS.length > this.listRows(width, rows);
      default:
        return this.listItems().length > this.listRows(width, rows);
    }
  }

  private renderBody(
    width: number,
    rows: number,
  ): { lines: string[]; position?: string } {
    const { theme } = this.options;

    switch (this.mode.kind) {
      case "help": {
        const text = this.helpText(this.mode.field, width);
        const scrolled = scrollLines(
          text,
          rows,
          this.mode.offset,
          width,
          theme,
        );

        this.mode.offset = scrolled.offset;
        this.mode.maxOffset = Math.max(0, text.length - rows);
        this.pageRows = Math.max(1, rows);

        return { lines: scrolled.lines };
      }

      case "pollIntervalEdit":
        return { lines: this.renderPollEditorBody(width, rows) };
      case "config":
        return this.renderList(
          CONFIG_FIELDS.length,
          this.configIndex,
          width,
          rows,
          (index, selected) => this.renderFieldRow(index, selected, width),
        );

      default: {
        const items = this.listItems();

        if (items.length === 0) {
          return {
            lines: emptyStateLines("No themes are available.", width, theme),
          };
        }

        return this.renderList(
          items.length,
          this.listIndex,
          width,
          rows,
          (index, selected) =>
            this.renderListRow(items[index]?.label ?? "", selected, width),
        );
      }
    }
  }

  private renderFieldRow(
    index: number,
    selected: boolean,
    width: number,
  ): string {
    const { theme } = this.options;
    const field = CONFIG_FIELDS[index];

    if (field === undefined) return "";

    const marker = selected ? theme.fg("accent", "▌") : " ";
    const label = theme.fg("muted", field.label.padEnd(LABEL_COLUMN_WIDTH));
    const value = this.valueText(field.id);
    const source = theme.fg(
      "muted",
      `[${formatSource(this.sourceOf(field.id))}]`,
    );

    return padToWidth(
      `${marker} ${label}${selected ? theme.fg("accent", value) : value} ${source}`,
      width,
    );
  }

  private renderList(
    count: number,
    selected: number,
    width: number,
    rows: number,
    renderRow: (index: number, selected: boolean) => string,
  ): { lines: string[]; position?: string } {
    const message = this.messageLines(width, rows);
    const listRows = this.listRows(width, rows);
    const window = listWindow(selected, count, listRows);
    const lines: string[] = [];

    for (let index = window.start; index < window.end; index++) {
      lines.push(renderRow(index, index === selected));
    }

    this.pageRows = listRows;

    return { lines: [...lines, ...message], position: window.position };
  }

  private renderListRow(
    label: string,
    selected: boolean,
    width: number,
  ): string {
    const { theme } = this.options;

    return padToWidth(
      selected ? theme.fg("accent", `→ ${label}`) : `  ${label}`,
      width,
    );
  }

  private renderPollEditorBody(width: number, budget: number): string[] {
    if (budget <= 0 || this.mode.kind !== "pollIntervalEdit") return [];

    const errorMessage = this.mode.error;
    const instruction = wrapTextWithAnsi(
      `Enter milliseconds (${String(POLL_INTERVAL_LIMITS.min)} to ${String(POLL_INTERVAL_LIMITS.max)}, inclusive).`,
      Math.max(1, width),
    );
    const input = this.pollInput.render(Math.max(1, width));

    if (!errorMessage) {
      const preferred = [...instruction, "", ...input];

      if (preferred.length <= budget) return preferred;

      return [...instruction.slice(0, Math.max(0, budget - 1)), ...input].slice(
        -budget,
      );
    }

    const error = this.styledMessage(errorMessage, "error", width);
    const preferred = [...instruction, "", ...input, "", ...error];

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
    const submitted = { ...this.desired };
    const changes = this.changes();
    const count = Object.keys(changes).length;

    this.busyText = "Saving configuration…";
    this.message = undefined;
    this.setMode({ kind: "config" });

    try {
      await this.options.save(scope, changes);

      Object.assign(this.current, submitted);
      this.message = {
        text:
          count === 0
            ? "No changes to save."
            : `Saved ${pluralize(count, "changed setting")} to ${configScopeLabel(scope)}. Press Ctrl+R to reload and apply.`,
        severity: count === 0 ? "info" : "success",
      };
    } catch (error) {
      this.message = {
        text: `Could not save the configuration: ${describeErrorSentence(error)}`,
        severity: "error",
      };
    } finally {
      this.busyText = undefined;
      this.options.requestRender();
    }
  }

  private setMode(mode: ConfigMode): void {
    this.mode = mode;
    this.syncInputFocus();
    this.options.requestRender();
  }

  private sourceOf(field: ConfigField): ConfigSource {
    const sources = this.options.config.runtimeConfigSources;

    switch (field) {
      case "themes.light":
        return sources.themes.light;
      case "themes.dark":
        return sources.themes.dark;
      case "detection.pollIntervalMs":
        return sources.detection.pollIntervalMs;
      case "syncEnabled":
        return sources.syncEnabled;
    }
  }

  private styledMessage(
    text: string,
    severity: ConfigMessageSeverity,
    width: number,
  ): string[] {
    const indent = "  ";
    const color = severity === "info" ? "muted" : severity;

    return wrapTextWithAnsi(text, Math.max(1, width - indent.length)).map(
      (line) => this.options.theme.fg(color, `${indent}${line}`),
    );
  }

  private syncInputFocus(): void {
    this.pollInput.focused =
      this._focused && this.mode.kind === "pollIntervalEdit";
  }

  private title(): string {
    switch (this.mode.kind) {
      case "config":
        return `${EXTENSION_NAME} Config`;
      case "help":
        return `${this.mode.field.title} Help`;
      case "themeSelect":
        return fieldTitle(this.mode.fieldId);
      case "syncSelect":
        return fieldTitle("syncEnabled");
      case "pollIntervalEdit":
        return fieldTitle("detection.pollIntervalMs");
      case "writeTarget":
        return "Write Config To";
    }
  }

  private valueText(field: ConfigField): string {
    const value = this.desired[field];

    return field === "detection.pollIntervalMs" ? `${value}ms` : value;
  }
}

function fieldTitle(id: ConfigField): string {
  return CONFIG_FIELDS.find((field) => field.id === id)?.title ?? "";
}

function formatSource(source: ConfigSource): string {
  return source === "default" ? "Default" : configScopeLabel(source);
}
