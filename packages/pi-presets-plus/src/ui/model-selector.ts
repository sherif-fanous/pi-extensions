/** Searches provider and model options and opens a keyboard-driven selection overlay. */
import { frameLine, frameSegment, wrapKeyHints } from "./frame.js";
import { matchesSelectKey } from "./select-keys.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  SelectList,
  truncateToWidth,
  type Component,
  type Focusable,
  type KeybindingsManager,
  type Terminal,
} from "@earendil-works/pi-tui";

/** One selectable identifier with optional searchable name and availability hint. */
export interface ModelSelectorItem {
  readonly id: string;
  readonly name?: string;
  readonly available?: boolean;
}

/** Options for a provider or model selection session. */
export interface ModelSelectorOptions {
  readonly title: string;
  readonly current: string;
  readonly items: readonly ModelSelectorItem[];
}

class ModelSelectorComponent implements Component, Focusable {
  private readonly input = new Input();
  private results: ModelSelectorItem[];
  private list: SelectList;
  private resolved = false;
  /** Footer lines from the last render, which the list height leaves room for. */
  private footerLineCount = 1;

  constructor(
    private readonly options: ModelSelectorOptions,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly done: (result: string | undefined) => void,
    private readonly requestRender: () => void,
  ) {
    this.results = [...options.items];
    this.list = this.buildList(options.current);
  }

  get focused(): boolean {
    return this.input.focused;
  }
  set focused(value: boolean) {
    this.input.focused = value;
  }

  invalidate(): void {
    this.input.invalidate();
  }

  handleInput(data: string): void {
    if (this.resolved) return;

    const { keybindings } = this;
    const up = matchesSelectKey(keybindings, data, "up");
    const down = !up && matchesSelectKey(keybindings, data, "down");

    if (matchesSelectKey(keybindings, data, "cancel")) this.finish(undefined);
    else if (matchesSelectKey(keybindings, data, "confirm")) {
      const selected = this.list.getSelectedItem();

      if (selected) this.finish(selected.value);
    } else if (up || down) {
      const count = this.results.length;

      if (count > 0) {
        const current = this.results.findIndex(
          (item) => item.id === this.list.getSelectedItem()?.value,
        );
        const direction = down ? 1 : -1;

        this.list.setSelectedIndex((current + direction + count) % count);
      }
    } else {
      const previous = this.input.getValue();

      this.input.handleInput(data);

      if (previous !== this.input.getValue()) {
        this.results = rankModelSelectorItems(
          this.options.items,
          this.input.getValue(),
        );

        this.list = this.buildList(
          normalize(this.input.getValue()) ? undefined : this.options.current,
        );
      }
    }

    this.requestRender();
  }

  render(width: number): string[] {
    const height = Math.max(1, this.terminal.rows - 2);
    const bodyWidth = Math.max(1, width - 2);
    const footerLines = wrapKeyHints(
      ["Type to Filter", "↑/↓ Move", "Enter Select", "Esc Cancel"],
      bodyWidth,
    );

    this.footerLineCount = footerLines.length;
    this.list = this.buildList(this.list.getSelectedItem()?.value);

    const results =
      this.results.length > 0
        ? this.list.render(bodyWidth)
        : [this.theme.fg("dim", "No matching options.")];
    const search = `${this.theme.fg("muted", "Search: ")}${this.input.render(Math.max(1, bodyWidth - 8))[0] ?? ""}`;
    const body = [
      this.theme.fg("accent", this.theme.bold(this.options.title)),
      search,
      ...results,
      // The rows above the footer start at the border, so the hints do too.
      ...footerLines.map((line) => this.theme.fg("dim", line.trimStart())),
    ];
    // Very short terminals reserve their remaining lines for the selection.
    const lines = this.isCompact(height)
      ? [...(height > results.length ? [search] : []), ...results].slice(
          0,
          height,
        )
      : [
          frameSegment("┌", "─", "┐", width),
          ...body.map((line) => frameLine(line, width)),
          frameSegment("└", "─", "┘", width),
        ];

    return lines.map((line) => truncateToWidth(line, Math.max(0, width), ""));
  }

  private buildList(current?: string): SelectList {
    const height = Math.max(1, this.terminal.rows - 2);
    // Borders, title, search, and the list's scroll line surround the rows.
    const maxVisible = Math.max(
      1,
      height - (this.isCompact(height) ? 2 : 5 + this.footerLineCount),
    );
    const list = new SelectList(
      this.results.map((item) => ({
        value: item.id,
        label: item.available === false ? `${item.id} (no key)` : item.id,
      })),
      maxVisible,
      {
        selectedPrefix: (text) => this.theme.fg("accent", text),
        selectedText: (text) => this.theme.fg("accent", text),
        description: (text) => this.theme.fg("muted", text),
        scrollInfo: (text) => this.theme.fg("dim", text),
        noMatch: (text) => this.theme.fg("dim", text),
      },
    );

    list.setSelectedIndex(
      Math.max(
        0,
        this.results.findIndex((item) => item.id === current),
      ),
    );

    return list;
  }

  /** Whether `height` is too short for the framed layout with one list row. */
  private isCompact(height: number): boolean {
    return height < 6 + this.footerLineCount;
  }

  private finish(result: string | undefined): void {
    this.resolved = true;
    this.done(result);
  }
}

/** Open a fresh selector and resolve with its confirmed identifier or cancellation. */
export async function openModelSelector(
  ctx: Pick<ExtensionCommandContext, "ui">,
  options: ModelSelectorOptions,
): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>(
    (tui, theme, keybindings, done) =>
      new ModelSelectorComponent(
        options,
        theme,
        keybindings,
        tui.terminal,
        done,
        () => tui.requestRender(),
      ),
    {
      overlay: true,
      overlayOptions: { anchor: "center", margin: 1, width: "90%" },
    },
  );
}

/** Rank token matches by exact identifier, identifier prefix, then registry order. */
export function rankModelSelectorItems(
  items: readonly ModelSelectorItem[],
  query: string,
): ModelSelectorItem[] {
  const normalized = normalize(query);

  if (!normalized) return [...items];

  const tokens = normalized.split(" ");
  const exact: ModelSelectorItem[] = [];
  const prefix: ModelSelectorItem[] = [];
  const other: ModelSelectorItem[] = [];

  for (const item of items) {
    const id = normalize(item.id);
    const text = `${id} ${normalize(item.name ?? "")}`;

    if (!tokens.every((token) => text.includes(token))) continue;
    if (id === normalized) exact.push(item);
    else if (id.startsWith(normalized)) prefix.push(item);
    else other.push(item);
  }

  return [...exact, ...prefix, ...other];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
