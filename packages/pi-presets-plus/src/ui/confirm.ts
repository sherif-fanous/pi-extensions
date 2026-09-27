/**
 * Yes/no confirmation overlay shared by the preset TUI surfaces.
 */
import {
  centerText,
  renderDialogFrame,
  resolveOverlayHeight,
  wrapBody,
} from "./frame.js";
import { matchesSelectKey } from "./select-keys.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  type Component,
  type Focusable,
  type KeybindingsManager,
  type Terminal,
} from "@earendil-works/pi-tui";

/** Share of the terminal height the dialog may use, in percent. */
const CONFIRM_MAX_HEIGHT_PERCENT = 50;
/** Rows kept free above and below the dialog. */
const CONFIRM_MARGIN = 2;

/** Button text for the two choices, defaulting to `Yes` and `No`. */
interface ConfirmLabels {
  readonly no: string;
  readonly yes: string;
}

class ConfirmComponent implements Component, Focusable {
  private selected: "no" | "yes" = "no";
  private resolved = false;
  private _focused = false;
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

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  handleInput(input: string): void {
    const { keybindings } = this;

    if (matchesSelectKey(keybindings, input, "cancel")) {
      this.finish(false);

      return;
    }

    if (matchesSelectKey(keybindings, input, "confirm") || input === " ") {
      this.finish(this.selected === "yes");

      return;
    }

    if (matchesSelectKey(keybindings, input, "up")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);

      return;
    }

    if (matchesSelectKey(keybindings, input, "down")) {
      this.scrollOffset += 1;

      return;
    }

    if (matchesSelectKey(keybindings, input, "pageUp")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - this.pageRows);

      return;
    }

    if (matchesSelectKey(keybindings, input, "pageDown")) {
      this.scrollOffset += this.pageRows;

      return;
    }

    if (matchesKey(input, Key.left) || matchesKey(input, Key.right)) {
      this.selected = this.selected === "yes" ? "no" : "yes";

      return;
    }

    if (input.toLowerCase() === "y") {
      this.finish(true);

      return;
    }

    if (input.toLowerCase() === "n") {
      this.finish(false);
    }
  }

  invalidate(): void {
    // No cached layout or external data to invalidate.
  }

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);
    const bodyWidth = Math.max(1, frameWidth - 2);
    const messageLines = wrapBody(this.message, bodyWidth - 4);
    const buttons = [
      this.renderButton("yes", this.labels.yes),
      this.renderButton("no", this.labels.no),
    ].join("   ");

    const frame = renderDialogFrame({
      bodyLines: messageLines.map((line) => `  ${line}`),
      footerHints: ["←/→ choose", "Enter confirm", "Esc cancel"],
      maxHeight: resolveOverlayHeight(
        this.terminal.rows,
        CONFIRM_MAX_HEIGHT_PERCENT,
        CONFIRM_MARGIN,
      ),
      pinnedLines: ["", centerText(buttons, bodyWidth)],
      scrollOffset: this.scrollOffset,
      theme: this.theme,
      title: this.theme.fg("accent", this.theme.bold(this.title)),
      width: frameWidth,
    });

    this.scrollOffset = frame.scrollOffset;
    this.pageRows = Math.max(1, frame.bodyRows);

    return frame.lines;
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
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: CONFIRM_MARGIN,
        maxHeight: `${CONFIRM_MAX_HEIGHT_PERCENT}%`,
        minWidth: 48,
        width: "50%",
      },
    },
  );
}
