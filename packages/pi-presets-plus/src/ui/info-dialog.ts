/**
 * Read-only overlay that frames multi-line output, scrolls a body taller
 * than the overlay, and closes on confirm or cancel.
 */
import { CLOSE_LABEL, PAGE_LABEL, SCROLL_LABEL } from "./labels.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
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

/**
 * Title and body for one informational overlay. The body may carry its own
 * styling; a failure or warning colors its first line to say so.
 */
export interface InfoDialogOptions {
  readonly body: string;
  readonly title: string;
}

class InfoDialogComponent implements Component, Focusable {
  private resolved = false;
  focused = false;
  private scrollOffset = 0;
  private pageRows = 1;

  constructor(
    private readonly options: InfoDialogOptions,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly done: () => void,
  ) {}

  handleInput(input: string): void {
    switch (matchSelectAction(this.keybindings, input)) {
      case "cancel":
      case "confirm":
        this.finish();

        break;
      case "up":
        this.scrollBy(-1);

        break;
      case "down":
        this.scrollBy(1);

        break;
      case "pageUp":
        this.scrollBy(-this.pageRows);

        break;
      case "pageDown":
        this.scrollBy(this.pageRows);

        break;
      case undefined:
        break;
    }
  }

  invalidate(): void {
    // No cached layout or external data to invalidate.
  }

  render(width: number): string[] {
    const closeHint = keyHint(
      this.keybindings,
      ["tui.select.confirm", "tui.select.cancel"],
      CLOSE_LABEL,
    );
    const layout = layoutFramedSurface({
      body: wrapTextWithAnsi(
        this.options.body,
        Math.max(1, frameBodyWidth(width)),
      ),
      hints: [closeHint],
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
        closeHint,
      ],
      scrollOffset: this.scrollOffset,
      terminalRows: this.terminal.rows,
      theme: this.theme,
      title: this.options.title,
      width,
    });

    this.scrollOffset = layout.scrollOffset;
    this.pageRows = layout.bodyRows;

    return layout.lines;
  }

  private finish(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.done();
  }

  /** Move the body window; `render` clamps the offset to the content. */
  private scrollBy(delta: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset + delta);
  }
}

/** Open the overlay and resolve once the user closes it. */
export async function openInfoDialog(
  ctx: Pick<ExtensionCommandContext, "ui">,
  options: InfoDialogOptions,
): Promise<void> {
  await ctx.ui.custom<void>(
    (tui, theme, keybindings, done) =>
      new InfoDialogComponent(options, theme, keybindings, tui.terminal, done),
    { overlay: true, overlayOptions: overlayOptions("nested") },
  );
}
