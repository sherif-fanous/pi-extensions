/**
 * Renders `/slice` boundary pickers inline in Pi's main screen, like Pi's
 * `/fork` picker, with the family's title, list model, and key hints.
 */

import type { SliceCandidate } from "./slice.js";
import { formatAgo } from "./time.js";
import {
  DynamicBorder,
  type ExtensionUIContext,
  type KeybindingsManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Spacer,
  Text,
  truncateToWidth,
  type Component,
} from "@earendil-works/pi-tui";
import {
  keyHint,
  listWindow,
  matchSelectAction,
  moveListSelection,
  wrapKeyHints,
} from "@sherif-fanous/pi-extensions-core";

/** Result returned when a boundary picker closes. */
export type PickerResult =
  { kind: "cancel" } | { kind: "end" } | { id: string; kind: "message" };

interface PickerItem {
  candidate?: SliceCandidate;
  result: PickerResult;
  text: string;
}

type PickerMode = "end" | "start";

/** The most messages a picker shows at once, as in Pi's `/fork` picker. */
const MAX_VISIBLE_ITEMS = 10;

class BoundaryPicker implements Component {
  private readonly bottom: readonly Component[];
  private readonly hints: readonly (string | undefined)[];
  private readonly top: readonly Component[];
  private selectedIndex: number;

  constructor(
    title: string,
    description: string,
    private readonly items: readonly PickerItem[],
    private readonly mode: PickerMode,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly onDone: (result: PickerResult) => void,
    private readonly startOrdinal?: number,
  ) {
    const border = new DynamicBorder((text) => theme.fg("border", text));

    this.selectedIndex = mode === "end" ? 0 : Math.max(0, items.length - 1);
    this.top = [
      new Spacer(1),
      new Text(theme.fg("accent", theme.bold(title)), 1, 0),
      new Text(theme.fg("muted", description), 1, 0),
      new Spacer(1),
      border,
      new Spacer(1),
    ];
    this.bottom = [new Spacer(1), border];
    this.hints = [
      keyHint(keybindings, ["tui.select.up", "tui.select.down"], "Move"),
      keyHint(
        keybindings,
        ["tui.select.pageUp", "tui.select.pageDown"],
        "Page",
      ),
      keyHint(keybindings, "tui.select.confirm", "Select"),
      keyHint(keybindings, "tui.select.cancel", "Cancel"),
    ];
  }

  handleInput(data: string): void {
    const action = matchSelectAction(this.keybindings, data);

    if (action === undefined) return;

    if (action === "confirm") {
      const selected = this.items[this.selectedIndex];

      if (selected) this.onDone(selected.result);
    } else if (action === "cancel") {
      this.onDone({ kind: "cancel" });
    } else {
      this.selectedIndex = moveListSelection(
        this.selectedIndex,
        this.items.length,
        action,
        MAX_VISIBLE_ITEMS,
      );
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    const top = this.top.flatMap((component) => component.render(width));
    const hints = wrapKeyHints(this.hints, Math.max(1, width - 2)).map(
      (line) => ` ${this.theme.fg("dim", line)}`,
    );
    const bottom = this.bottom.flatMap((component) => component.render(width));

    return [...top, ...this.renderList(width), ...hints, ...bottom];
  }

  private renderList(width: number): string[] {
    const lines: string[] = [];
    const window = listWindow(
      this.selectedIndex,
      this.items.length,
      MAX_VISIBLE_ITEMS,
    );

    for (let index = window.start; index < window.end; index += 1) {
      const item = this.items[index];

      if (!item) continue;

      const selected = index === this.selectedIndex;
      const cursor = selected ? this.theme.fg("accent", "→ ") : "  ";
      const normalized = item.text.replaceAll("\n", " ").trim();
      const text = truncateToWidth(normalized, Math.max(0, width - 2), "…");

      lines.push(cursor + (selected ? this.theme.bold(text) : text));
      lines.push(this.renderMetadata(item, width));
      lines.push("");
    }

    if (window.position !== undefined) {
      const from =
        this.mode === "end" && this.startOrdinal
          ? ` · from message ${this.startOrdinal}`
          : "";
      const position = `  ${window.position}${from}`;

      lines.push(this.theme.fg("muted", truncateToWidth(position, width, "…")));
      lines.push("");
    }

    return lines;
  }

  private renderMetadata(item: PickerItem, width: number): string {
    const editorHint = this.mode === "end" ? " · goes to your editor" : "";
    const metadata = item.candidate
      ? `  Message ${item.candidate.ordinal} of ${item.candidate.total} · ${formatAgo(item.candidate.timestamp)}${editorHint}`
      : "  No end boundary selected";

    return this.theme.fg("muted", truncateToWidth(metadata, width, "…"));
  }
}

/** Show the end boundary picker. */
export async function showEndPicker(
  ui: ExtensionUIContext,
  candidates: readonly SliceCandidate[],
  startOrdinal: number,
): Promise<PickerResult> {
  const afterStart = candidates.filter(
    (candidate) => candidate.ordinal > startOrdinal,
  );
  const items: PickerItem[] = [
    {
      text: "Keep everything to the end",
      result: { kind: "end" },
    },
    ...afterStart.map((candidate) => ({
      candidate,
      text: candidate.text,
      result: { id: candidate.id, kind: "message" } as const,
    })),
  ];

  return showPicker(
    ui,
    "Slice: End Before Message",
    "Select a message to exclude it and everything after it.",
    items,
    "end",
    startOrdinal,
  );
}

/** Show the inclusive start boundary picker. */
export async function showStartPicker(
  ui: ExtensionUIContext,
  candidates: readonly SliceCandidate[],
): Promise<PickerResult> {
  const items = candidates.map((candidate) => ({
    candidate,
    text: candidate.text,
    result: { id: candidate.id, kind: "message" } as const,
  }));

  return showPicker(
    ui,
    "Slice: Start at Message",
    "Select the first message to keep in the new session.",
    items,
    "start",
  );
}

async function showPicker(
  ui: ExtensionUIContext,
  title: string,
  description: string,
  items: readonly PickerItem[],
  mode: PickerMode,
  startOrdinal?: number,
): Promise<PickerResult> {
  return ui.custom<PickerResult>(
    (_tui, theme, keybindings, done) =>
      new BoundaryPicker(
        title,
        description,
        items,
        mode,
        theme,
        keybindings,
        done,
        startOrdinal,
      ),
  );
}
