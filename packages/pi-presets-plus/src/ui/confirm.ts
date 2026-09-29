/**
 * Yes/no confirmation overlay shared by the preset TUI surfaces.
 */
import { CANCEL_LABEL, PAGE_LABEL, SCROLL_LABEL } from "./labels.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type KeybindingsManager,
  type Terminal,
} from "@earendil-works/pi-tui";
import {
  frameBodyWidth,
  keyHint,
  layoutFramedSurface,
  matchSelectAction,
  overlayOptions,
} from "@sherif-fanous/pi-extensions-core";

/** Button text for the two choices, defaulting to `Yes` and `No`. */
interface ConfirmLabels {
  readonly no: string;
  readonly yes: string;
}

class ConfirmComponent implements Component, Focusable {
  private selected: "no" | "yes" = "no";
  private resolved = false;
  focused = false;
  private scrollOffset = 0;
  private pageRows = 1;

  constructor(
    private readonly title: string,
    private readonly message: string,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly done: (result: boolean) => void,
    private readonly labels: ConfirmLabels,
  ) {}

  handleInput(input: string): void {
    switch (matchSelectAction(this.keybindings, input)) {
      case "cancel":
        this.finish(false);

        return;
      case "confirm":
        this.finish(this.selected === "yes");

        return;
      case "up":
        this.scrollOffset = Math.max(0, this.scrollOffset - 1);

        return;
      case "down":
        this.scrollOffset += 1;

        return;
      case "pageUp":
        this.scrollOffset = Math.max(0, this.scrollOffset - this.pageRows);

        return;
      case "pageDown":
        this.scrollOffset += this.pageRows;

        return;
      case undefined:
        break;
    }

    if (input === " ") {
      this.finish(this.selected === "yes");
    } else if (matchesKey(input, Key.left) || matchesKey(input, Key.right)) {
      this.selected = this.selected === "yes" ? "no" : "yes";
    } else if (input.toLowerCase() === "y") {
      this.finish(true);
    } else if (input.toLowerCase() === "n") {
      this.finish(false);
    }
  }

  invalidate(): void {
    // No cached layout or external data to invalidate.
  }

  render(width: number): string[] {
    const bodyWidth = frameBodyWidth(width);
    const choiceHints = [
      `←/→ Choose`,
      keyHint(this.keybindings, "tui.select.confirm", "Confirm"),
      `y ${this.labels.yes}`,
      // `n` still works, but its hint would repeat the cancel hint's action.
      this.labels.no === CANCEL_LABEL ? undefined : `n ${this.labels.no}`,
      keyHint(this.keybindings, "tui.select.cancel", CANCEL_LABEL),
    ];
    const buttons = [
      this.renderButton("yes", this.labels.yes),
      this.renderButton("no", this.labels.no),
    ].join("   ");
    const buttonIndent = " ".repeat(
      Math.max(0, Math.floor((bodyWidth - visibleWidth(buttons)) / 2)),
    );
    const layout = layoutFramedSurface({
      body: wrapTextWithAnsi(this.message, Math.max(1, bodyWidth)),
      hints: choiceHints,
      overflowHints: [
        keyHint(
          this.keybindings,
          ["tui.select.up", "tui.select.down"],
          SCROLL_LABEL,
        ),
        keyHint(
          this.keybindings,
          ["tui.select.pageUp", "tui.select.pageDown"],
          PAGE_LABEL,
        ),
        ...choiceHints,
      ],
      pinned: ["", `${buttonIndent}${buttons}`],
      scrollOffset: this.scrollOffset,
      terminalRows: this.terminal.rows,
      theme: this.theme,
      title: this.title,
      width,
    });

    this.scrollOffset = layout.scrollOffset;
    this.pageRows = layout.bodyRows;

    return layout.lines;
  }

  private finish(result: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.done(result);
  }

  private renderButton(value: "no" | "yes", label: string): string {
    const text = this.selected === value ? `● ${label}` : `○ ${label}`;

    return this.selected === value ? this.theme.fg("accent", text) : text;
  }
}

/** Open the confirmation overlay and resolve with the user's choice. */
export async function openConfirm(
  ctx: Pick<ExtensionCommandContext, "ui">,
  title: string,
  message: string,
  labels: ConfirmLabels = { no: "No", yes: "Yes" },
): Promise<boolean> {
  return ctx.ui.custom<boolean>(
    (tui, theme, keybindings, done) =>
      new ConfirmComponent(
        title,
        message,
        theme,
        keybindings,
        tui.terminal,
        done,
        labels,
      ),
    { overlay: true, overlayOptions: overlayOptions("nested") },
  );
}
