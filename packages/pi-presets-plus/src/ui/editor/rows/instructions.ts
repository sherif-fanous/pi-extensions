/**
 * The editor's prompt row, which previews the preset instructions on one
 * line and opens the multi-line editor when the user presses Enter.
 */
import {
  EMPTY_INPUT_PLACEHOLDER,
  renderValueRow,
  valueWidth,
  withFieldDiagnostic,
} from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { matchSelectAction } from "@sherif-fanous/pi-extensions-core";

/** Build the prompt row. */
export function makeInstructionsRow(host: EditorRowHost): EditorRow {
  return {
    id: "instructions",
    help: {
      body: [
        "This text is added to Pi's system prompt while the preset is active. It does not replace Pi's existing prompt.",
        "Use it for project conventions, your preferred tone, or rules Pi should follow.",
        "Press Enter on the Prompt row to open the multi-line editor, then Ctrl+S to confirm or Esc to cancel.",
      ],
      title: "Prompt",
    },
    handleInput(input) {
      if (matchSelectAction(host.keybindings, input) !== "confirm") return;

      void host.runAsync(() => host.openPromptEditor());
    },
    renderLines(width) {
      const state = host.getState();
      const focused = host.currentRow() === "instructions";
      const preview =
        state.instructions.length === 0
          ? host.theme.fg("dim", EMPTY_INPUT_PLACEHOLDER)
          : state.instructions.replaceAll("\n", " ↵ ");

      return withFieldDiagnostic(
        host,
        "instructions",
        renderValueRow(
          host.theme,
          "Prompt",
          truncateToWidth(preview, valueWidth(width), "…"),
          focused,
        ),
      );
    },
  };
}
