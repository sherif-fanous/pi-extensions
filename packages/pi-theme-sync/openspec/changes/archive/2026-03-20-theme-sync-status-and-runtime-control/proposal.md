## Why

`pi-theme-sync` currently runs as a background-only extension with no operator-facing inspection surface and no supported way to adjust configuration without hand-editing JSON files. Users need a way to inspect the extension’s current state and a guided way to edit its configuration from within Pi, while keeping runtime behavior predictable and avoiding unnecessary lifecycle complexity.

## What Changes

- Add a `/theme-sync` parent command whose primary interactive workflow is `config`, with `status` available as an inspection subcommand.
- Add a `/theme-sync config` interactive widget that lets the user edit `Light Mode Theme`, `Dark Mode Theme`, `Polling Interval`, and `Sync Status`.
- Add an explicit write-target step in the config workflow so the user chooses whether each saved change is written to project or global config.
- Extend configuration with a top-level `isSyncActive` boolean while preserving project-over-global-per-key precedence.
- Use Pi theme selection UI to let the user choose light and dark theme mappings from the currently available Pi themes.
- Validate `Polling Interval` as a numeric value greater than or equal to `1000` milliseconds.
- Add a `/theme-sync status` interactive widget that shows current appearance, applied theme, desired theme, sync active state, detection strategy, available detectors, polling interval, last update time, last event, and warnings.
- Keep configuration application explicit: changes saved through `/theme-sync config` take effect after the user runs `/reload`, and manual external config edits also require `/reload`.

## Capabilities

### New Capabilities

- `theme-sync-status`: Command-driven status widget and runtime inspection for the extension.
- `theme-sync-config-ui`: Command-driven interactive configuration editing for theme sync settings.

### Modified Capabilities

- `theme-sync-configuration`: Extend configuration loading and precedence to support `isSyncActive`, interactive config writes, and mixed-source effective configuration reporting.
- `theme-sync-debugging`: Replace the v1 “no diagnostics command or persistent UI” behavior with explicit `/theme-sync config` and `/theme-sync status` interactive surfaces.
- `theme-sync-extension`: Extend extension-level behavior with slash command handling, interactive widgets, explicit reload-oriented config flow, and status reporting.

## Impact

- Affects `src/index.ts` command registration, widget flow, and status rendering.
- Affects config model/types and README documentation for new command and config behavior.
- Introduces interactive widget-based configuration and inspection flows within the Pi extension runtime.
- Requires runtime state tracking rich enough to explain effective behavior in the status widget.
- Intentionally keeps config application manual via `/reload` to avoid config watching, implicit reloads, and in-place runtime mutation complexity.
