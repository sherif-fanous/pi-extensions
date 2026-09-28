/**
 * The editor's tools row, which switches between inheriting the session's
 * tools and pinning a list, and moves a cursor over that list to toggle
 * individual tools.
 */
import { TOOLS_LABEL } from "../../labels.js";
import { selectToolsMode, toggleSelectedTool } from "../draft.js";
import { packTokens, renderChoiceRow } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import { matchSelectAction } from "@sherif-fanous/pi-extensions-core";

/** Indent of the lines below the tools row. */
const DETAIL_INDENT = "    ";

/** Build the tools row. */
export function makeToolsRow(host: EditorRowHost): EditorRow {
  let toolIndex = 0;

  function enterPresetToolsMode(): void {
    host.setState(
      selectToolsMode(host.getState(), "preset", host.initialActiveTools),
    );
    toolIndex = 0;
  }

  return {
    id: "tools",
    help: {
      body: [
        "Tools are what Pi can use during a session, such as reading files, running commands, or searching the web.",
        "Session uses whatever tools are active when you apply the preset.",
        "Preset always uses the tools you pick here, regardless of what's currently active.",
      ],
      title: "Tools",
    },
    handleInput(input) {
      const state = host.getState();

      if (matchesKey(input, Key.left)) {
        if (state.toolsMode === "preset" && toolIndex === 0) {
          host.setState(
            selectToolsMode(state, "session", host.initialActiveTools),
          );
        } else {
          toolIndex = Math.max(0, toolIndex - 1);
        }
      } else if (matchesKey(input, Key.right)) {
        if (state.toolsMode === "session") {
          enterPresetToolsMode();
        } else {
          toolIndex = Math.min(
            Math.max(0, host.allTools.length - 1),
            toolIndex + 1,
          );
        }
      } else if (input === " ") {
        if (state.toolsMode === "session") {
          enterPresetToolsMode();
        } else {
          host.setState(
            selectToolsMode(state, "session", host.initialActiveTools),
          );
        }
      } else if (
        matchSelectAction(host.keybindings, input) === "confirm" &&
        state.toolsMode === "preset"
      ) {
        const tool = host.allTools[toolIndex];

        if (!tool) return;

        host.setState(toggleSelectedTool(state, tool));
      }
    },
    renderLines(width) {
      const state = host.getState();
      const focused = host.currentRow() === "tools";
      const lines = renderChoiceRow(
        host.theme,
        TOOLS_LABEL,
        ["session", "preset"],
        state.toolsMode,
        focused,
        width,
      );

      if (state.toolsMode === "session") {
        lines.push(
          host.theme.fg(
            "dim",
            `${DETAIL_INDENT}Session: inherits the active tool set.`,
          ),
        );
      } else if (host.allTools.length === 0) {
        lines.push(
          host.theme.fg("muted", `${DETAIL_INDENT}No tools available.`),
        );
      } else {
        const selected = new Set(state.selectedTools);
        const renderedTools = host.allTools.map((tool, index) => {
          const marker = selected.has(tool) ? "x" : " ";
          const text = `[${marker}] ${tool}`;

          return index === toolIndex && focused
            ? host.theme.fg("accent", text)
            : text;
        });

        lines.push(
          ...packTokens(renderedTools, width - DETAIL_INDENT.length).map(
            (line) => `${DETAIL_INDENT}${line}`,
          ),
        );
      }

      const diagnostic = host.getFieldDiagnostic("tools");

      if (!diagnostic) return lines;

      const color = diagnostic.severity === "warning" ? "warning" : "error";

      return [...lines, host.theme.fg(color, `    ${diagnostic.message}`)];
    },
  };
}
