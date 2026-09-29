/** Searches provider and model options and opens a keyboard-driven selection overlay. */
import {
  CANCEL_LABEL,
  MOVE_LABEL,
  PAGE_LABEL,
  SELECT_LABEL,
} from "./labels.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  truncateToWidth,
  type Component,
  type Focusable,
  type KeybindingsManager,
  type Terminal,
} from "@earendil-works/pi-tui";
import {
  emptyStateLines,
  frameBodyRows,
  frameBodyWidth,
  keyHint,
  listWindow,
  matchSelectAction,
  moveListSelection,
  overlayMaxHeight,
  overlayOptions,
  renderFrame,
  wrapKeyHints,
} from "@sherif-fanous/pi-extensions-core";

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

/** Label of the search field above the list. */
const SEARCH_LABEL = "Search: ";

class ModelSelectorComponent implements Component, Focusable {
  private readonly input = new Input();
  private results: ModelSelectorItem[];
  private selectedIndex: number;
  private resolved = false;
  /** List rows from the last render, the page PgUp and PgDn move by. */
  private pageRows = 1;

  constructor(
    private readonly options: ModelSelectorOptions,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly done: (result: string | undefined) => void,
    private readonly requestRender: () => void,
  ) {
    this.results = [...options.items];
    this.selectedIndex = this.indexOf(options.current);
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

    const action = matchSelectAction(this.keybindings, data);

    switch (action) {
      case "cancel":
        this.finish(undefined);

        break;

      case "confirm": {
        const selected = this.results[this.selectedIndex];

        if (selected) this.finish(selected.id);

        break;
      }

      case "down":
      case "pageDown":
      case "pageUp":
      case "up":
        this.selectedIndex = moveListSelection(
          this.selectedIndex,
          this.results.length,
          action,
          this.pageRows,
        );

        break;
      case undefined:
        this.filter(data);

        break;
    }

    this.requestRender();
  }

  /**
   * Draw the selector from the frame pieces. It keeps a search row above
   * a list window, always offers PgUp/PgDn, and drops the frame when the
   * terminal is too short for one, which `layoutFramedSurface`'s scrolled
   * body can't do.
   */
  render(width: number): string[] {
    const height = overlayMaxHeight(this.terminal.rows);
    const bodyWidth = frameBodyWidth(width);
    const footer = wrapKeyHints(
      [
        keyHint(
          this.keybindings,
          ["tui.select.up", "tui.select.down"],
          MOVE_LABEL,
        ),
        keyHint(
          this.keybindings,
          ["tui.select.pageUp", "tui.select.pageDown"],
          PAGE_LABEL,
        ),
        keyHint(this.keybindings, "tui.select.confirm", SELECT_LABEL),
        keyHint(this.keybindings, "tui.select.cancel", CANCEL_LABEL),
      ],
      bodyWidth,
    );
    // The search row sits above the list inside the frame.
    const framedRows = frameBodyRows(height, footer.length) - 1;
    const search = `${this.theme.fg("muted", SEARCH_LABEL)}${this.input.render(Math.max(1, bodyWidth - SEARCH_LABEL.length))[0] ?? ""}`;

    // A terminal too short for the frame keeps its rows for the list.
    if (framedRows < 1) {
      const rows = this.renderList(height, width);

      return [...(height > rows.lines.length ? [search] : []), ...rows.lines]
        .slice(0, height)
        .map((line) => truncateToWidth(line, Math.max(0, width), "…"));
    }

    const list = this.renderList(framedRows, bodyWidth);

    return renderFrame({
      body: [search, ...list.lines],
      footer,
      theme: this.theme,
      title: this.options.title,
      ...(list.position === undefined
        ? {}
        : { titleRight: this.theme.fg("muted", list.position) }),
      width,
    });
  }

  private filter(data: string): void {
    const previous = this.input.getValue();

    this.input.handleInput(data);

    if (previous === this.input.getValue()) return;

    this.results = rankModelSelectorItems(
      this.options.items,
      this.input.getValue(),
    );

    this.selectedIndex = normalize(this.input.getValue())
      ? 0
      : this.indexOf(this.options.current);
  }

  private finish(result: string | undefined): void {
    this.resolved = true;
    this.done(result);
  }

  /** Index of `id` in the current results, or the first result. */
  private indexOf(id: string): number {
    return Math.max(
      0,
      this.results.findIndex((item) => item.id === id),
    );
  }

  /**
   * The visible list rows, `→ ` before the selected one, and the `(n/m)`
   * position when not every result fits in `rows`.
   */
  private renderList(
    rows: number,
    width: number,
  ): { lines: string[]; position: string | undefined } {
    this.pageRows = Math.max(1, rows);

    if (this.results.length === 0) {
      const message =
        this.options.items.length === 0
          ? "No options to choose from."
          : "No options match this search.";

      return {
        lines: emptyStateLines(message, width, this.theme),
        position: undefined,
      };
    }

    const window = listWindow(
      this.selectedIndex,
      this.results.length,
      Math.max(1, rows),
    );
    const lines = this.results
      .slice(window.start, window.end)
      .map((item, offset) => {
        const selected = window.start + offset === this.selectedIndex;
        const suffix =
          item.available === false ? this.theme.fg("muted", " (no key)") : "";

        return selected
          ? `${this.theme.fg("accent", `→ ${item.id}`)}${suffix}`
          : `  ${item.id}${suffix}`;
      });

    return { lines, position: window.position };
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
    { overlay: true, overlayOptions: overlayOptions("nested") },
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
