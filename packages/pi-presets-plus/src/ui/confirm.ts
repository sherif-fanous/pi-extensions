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
  frameBodyRows,
  frameBodyWidth,
  keyHint,
  matchSelectAction,
  overlayMaxHeight,
  overlayOptions,
  renderFrame,
  scrollLines,
  wrapKeyHints,
} from "@sherif-fanous/pi-extensions-core";

/** Button text for the two choices, defaulting to `Yes` and `No`. */
interface ConfirmLabels {
  readonly no: string;
  readonly yes: string;
}

/** Body rows the choices take below the message: a blank row and the buttons. */
const CHOICE_ROWS = 2;

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
    const height = overlayMaxHeight(this.terminal.rows);
    const messageLines = wrapTextWithAnsi(this.message, Math.max(1, bodyWidth));
    const choiceHints = [
      `←/→ Choose`,
      keyHint(this.keybindings, "tui.select.confirm", "Confirm"),
      `y ${this.labels.yes}`,
      `n ${this.labels.no}`,
      keyHint(this.keybindings, "tui.select.cancel", CANCEL_LABEL),
    ];
    const messageRowsFor = (footerLineCount: number): number =>
      Math.max(1, frameBodyRows(height, footerLineCount) - CHOICE_ROWS);
    let footer = wrapKeyHints(choiceHints, bodyWidth);

    if (messageLines.length > messageRowsFor(footer.length)) {
      footer = wrapKeyHints(
        [
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
        bodyWidth,
      );
    }

    const messageRows = messageRowsFor(footer.length);
    const message = scrollLines(
      messageLines,
      messageRows,
      this.scrollOffset,
      bodyWidth,
      this.theme,
    );
    const buttons = [
      this.renderButton("yes", this.labels.yes),
      this.renderButton("no", this.labels.no),
    ].join("   ");
    const buttonIndent = " ".repeat(
      Math.max(0, Math.floor((bodyWidth - visibleWidth(buttons)) / 2)),
    );

    this.scrollOffset = message.offset;
    this.pageRows = messageRows;

    return renderFrame({
      body: [...message.lines, "", `${buttonIndent}${buttons}`],
      footer,
      theme: this.theme,
      title: this.title,
      width,
    });
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
