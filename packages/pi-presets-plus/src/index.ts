/**
 * Entry point for the pi-presets-plus extension. Registers the `/presets`
 * command, the `--preset` flag, and the host event handlers that keep the
 * active preset applied and tracked across a session.
 */

import { activateAtStartup } from "./activation/activate.js";
import {
  handleModelSelectDrift,
  syncDirtyFromCurrentState,
} from "./activation/drift-handlers.js";
import { ActivePresetSession } from "./activation/session.js";
import { captureStartupSelection } from "./activation/startup-selection.js";
import {
  getArgumentCompletions,
  runPresetsCommand,
} from "./commands/presets/router.js";
import { EXTENSION_NAME } from "./extension-name.js";
import { registerPresetFlag } from "./flag.js";
import { HotkeyRegistry } from "./hotkey-registry.js";
import { findPreset } from "./preset-identity.js";
import { loadPresetsConfig } from "./store/api.js";
import { PRESETS_PLUS_CONFIG } from "./store/config.js";
import { migrateAll } from "./store/migrate.js";
import type { PresetScope } from "./types.js";
import { registerCommandReportRenderer } from "./ui/command-report.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  describeErrorSentence,
  guardCommand,
  guardEvent,
  notifyWarnings,
  type ConfigMigration,
  type ConfigOutcome,
} from "@sherif-fanous/pi-extensions-core";

/** Register every pi-presets-plus command, flag, and event handler. */
export default function presetsPlus(pi: ExtensionAPI): void {
  const session = new ActivePresetSession();
  const hotkeys = new HotkeyRegistry();
  const presetNamesLoader: { fn: () => Promise<readonly string[]> } = {
    fn: () => Promise.resolve([]),
  };

  registerCommandReportRenderer(pi);
  registerPresetFlag(pi);

  pi.registerCommand("presets", {
    description: "Browse, activate, and manage presets",
    getArgumentCompletions: (prefix) =>
      getArgumentCompletions(prefix, () => presetNamesLoader.fn()),
    handler: guardCommand(EXTENSION_NAME, (args, ctx) =>
      runPresetsCommand(args, ctx, { hotkeys, pi, session }),
    ),
  });

  // The guard only catches what escapes the startup flow below, which
  // collects its own warnings and reports them together.
  pi.on(
    "session_start",
    guardEvent(EXTENSION_NAME, "session_start", async (_event, ctx) => {
      const startupSelection = captureStartupSelection(ctx, pi);
      // Every startup step after loading adds its warnings here, so they
      // show after the configuration's in one notification once startup
      // ends.
      const startupWarnings: string[] = [];
      let migration: ConfigMigration | undefined;
      let config: ConfigOutcome<PresetScope> | undefined;

      try {
        migration = await migrateAll(ctx);

        const loaded = await loadPresetsConfig(ctx);
        const { hotkeyAnalysis, presets, showInactiveStatus } = loaded;

        config = loaded.config.withMigrations(migration);
        session.setShowInactiveStatus(showInactiveStatus, ctx);
        await activateAtStartup(
          ctx,
          pi,
          session,
          loaded,
          startupSelection,
          startupWarnings,
        );

        presetNamesLoader.fn = async () => {
          try {
            return (await loadPresetsConfig(ctx)).presets.map(
              (preset) => preset.name,
            );
          } catch {
            return [];
          }
        };

        hotkeys.bindForSession(
          presets,
          hotkeyAnalysis,
          ctx,
          pi,
          session,
          startupWarnings,
        );
      } catch (err) {
        startupWarnings.push(
          `Could not load preset files: ${describeErrorSentence(err)}`,
        );
      }

      // Loading failed after the migration ran, so what it did is reported
      // with the files as they read now.
      if (config === undefined && migration !== undefined) {
        config = (await PRESETS_PLUS_CONFIG.load(ctx)).withMigrations(
          migration,
        );
      }

      if (config) {
        config.notify(ctx, startupWarnings);
      } else {
        notifyWarnings(ctx, EXTENSION_NAME, startupWarnings);
      }
    }),
  );

  pi.on(
    "before_agent_start",
    guardEvent(EXTENSION_NAME, "before_agent_start", async (event, ctx) => {
      const active = session.current();

      if (!active) return undefined;

      // This load drops its warnings on purpose. Session start and
      // `/presets reload` already report them, and repeating them on every
      // agent turn would bury the rest of the conversation.
      const { presets } = await loadPresetsConfig(ctx);
      const preset = findPreset(presets, active);

      if (!preset?.instructions) return undefined;

      return {
        systemPrompt: `${event.systemPrompt}\n\n${preset.instructions}`,
      };
    }),
  );

  pi.on(
    "model_select",
    guardEvent(EXTENSION_NAME, "model_select", async (event, ctx) => {
      await handleModelSelectDrift(event, ctx, pi, session);
    }),
  );

  pi.on(
    "thinking_level_select",
    guardEvent(EXTENSION_NAME, "thinking_level_select", async (_event, ctx) => {
      await syncDirtyFromCurrentState(ctx, pi, session);
    }),
  );

  pi.on(
    "turn_start",
    guardEvent(EXTENSION_NAME, "turn_start", async (_event, ctx) => {
      await syncDirtyFromCurrentState(ctx, pi, session);
    }),
  );
}
