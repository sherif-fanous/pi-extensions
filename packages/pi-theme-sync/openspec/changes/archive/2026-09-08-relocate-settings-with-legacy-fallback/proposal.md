## Why

Theme Sync settings should live in a dedicated `theme-sync` directory instead of directly in Pi's global and project directories. Existing installations must keep working without requiring users to move their files.

## What Changes

- Prefer `<getAgentDir()>/theme-sync/settings.json` globally and `.pi/theme-sync/settings.json` per project.
- Fall back independently to each scope's `theme-sync.json` only when its preferred file is missing. Do not merge preferred and legacy files within a scope.
- Keep project-over-global per-key precedence and existing validation behavior.
- Save to the selected file, including legacy files; create the preferred path when neither file exists.
- Resolve selection on every load and save and show resolved paths in the write-target overlay.
- Document legacy locations as deprecated in `README.md`, with manual migration instructions and no removal date or recurring deprecation warnings. Do not recreate or update `HANDOFF.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `theme-sync-configuration`: Define preferred and legacy locations, scope-local fallback, fresh resolution, and save destinations.
- `theme-sync-config-ui`: Show resolved file paths when choosing where to save changes.

## Impact

- `src/config.ts`: Path selection shared by loading and persistence, preserving malformed-file write protection and unrelated settings.
- `src/command.ts`: Replace fixed write-target paths with resolved destinations.
- Configuration path, load/save, and overlay tests: Cover preferred, legacy, missing, invalid, and mixed-scope cases.
- `README.md`: Document new paths, compatibility, and manual migration.
- No new dependencies, automatic file moves, settings-schema changes, or changes to runtime reload behavior.
