/**
 * Read-only overlay that frames multi-line output, colors it by tone,
 * scrolls a body taller than the overlay, and dismisses on confirm or
 * cancel.
 */
import { renderDialogFrame, resolveOverlayHeight, wrapBody } from "./frame.js";
import { matchesSelectKey } from "./select-keys.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type {
  Component,
  Focusable,
  KeybindingsManager,
  Terminal,
} from "@earendil-works/pi-tui";

/** Title, body, and optional tone for one informational overlay. */
export interface InfoDialogOptions {
  readonly body: string;
  readonly title: string;
  readonly tone?: InfoDialogTone;
}

/** Severity that picks the title color and the footer hint wording. */
export type InfoDialogTone = "info" | "warning" | "error";

/** Dialog options after the default tone is filled in. */
type ResolvedInfoDialogOptions = InfoDialogOptions & { tone: InfoDialogTone };

/** Share of the terminal height the dialog may use, in percent. */
const INFO_DIALOG_MAX_HEIGHT_PERCENT = 90;
/** Rows kept free above and below the dialog. */
const INFO_DIALOG_MARGIN = 2;

class InfoDialogComponent implements Component, Focusable {
  private resolved = false;
  private _focused = false;
  private scrollOffset = 0;
  private pageRows = 1;

  constructor(
    private readonly options: ResolvedInfoDialogOptions,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly done: () => void,
  ) {}

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  handleInput(input: string): void {
    const { keybindings } = this;

    if (
      matchesSelectKey(keybindings, input, "confirm") ||
      matchesSelectKey(keybindings, input, "cancel")
    ) {
      this.finish();

      return;
    }

    if (matchesSelectKey(keybindings, input, "up")) {
      this.scrollBy(-1);
    } else if (matchesSelectKey(keybindings, input, "down")) {
      this.scrollBy(1);
    } else if (matchesSelectKey(keybindings, input, "pageUp")) {
      this.scrollBy(-this.pageRows);
    } else if (matchesSelectKey(keybindings, input, "pageDown")) {
      this.scrollBy(this.pageRows);
    }
  }

  invalidate(): void {
    // No cached layout or external data to invalidate.
  }

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);
    const bodyWidth = Math.max(1, frameWidth - 2);
    const titleColor = toneTitleColor(this.options.tone);
    const frame = renderDialogFrame({
      bodyLines: wrapBody(this.options.body, bodyWidth - 4).map(
        (line) => `  ${line}`,
      ),
      footerHints: [footerHint(this.options.tone)],
      maxHeight: resolveOverlayHeight(
        this.terminal.rows,
        INFO_DIALOG_MAX_HEIGHT_PERCENT,
        INFO_DIALOG_MARGIN,
      ),
      pinnedLines: [""],
      scrollOffset: this.scrollOffset,
      theme: this.theme,
      title: this.theme.fg(titleColor, this.theme.bold(this.options.title)),
      width: frameWidth,
    });

    this.scrollOffset = frame.scrollOffset;
    this.pageRows = Math.max(1, frame.bodyRows);

    return frame.lines;
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

/** Open the overlay and resolve once the user dismisses it. */
export async function openInfoDialog(
  ctx: Pick<ExtensionCommandContext, "ui">,
  options: InfoDialogOptions,
): Promise<void> {
  await ctx.ui.custom<void>(
    (tui, theme, keybindings, done) =>
      new InfoDialogComponent(
        { ...options, tone: options.tone ?? "info" },
        theme,
        keybindings,
        tui.terminal,
        done,
      ),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: INFO_DIALOG_MARGIN,
        maxHeight: `${INFO_DIALOG_MAX_HEIGHT_PERCENT}%`,
        minWidth: 48,
        width: "90%",
      },
    },
  );
}

function footerHint(tone: InfoDialogTone): string {
  if (tone === "error") return "Press Enter or Esc to dismiss error";
  if (tone === "warning") return "Press Enter or Esc to dismiss warning";

  return "Press Enter or Esc to dismiss";
}

function toneTitleColor(tone: InfoDialogTone): Parameters<Theme["fg"]>[0] {
  if (tone === "error") return "error";
  if (tone === "warning") return "warning";

  return "accent";
}
