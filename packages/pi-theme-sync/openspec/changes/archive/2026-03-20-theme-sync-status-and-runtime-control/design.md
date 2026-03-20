## Context

`pi-theme-sync` currently loads configuration at startup, determines the current appearance, applies the mapped theme, and then continues normal theme-sync behavior for the duration of the runtime. It does not currently expose slash commands, status UI, or an interactive configuration workflow.

This change adds one command-driven entrypoint and overlay-based views:

- `/theme-sync` opens a Pi overlay menu with two bare options: `Config` and `Status`
- selecting `Config` opens a popup overlay configuration window
- selecting `Status` opens a popup overlay status window

The extension will continue to treat configuration as startup-time input. Configuration changes saved from the config overlay, as well as manual edits made outside Pi, will only take effect after the user explicitly runs `/reload`.

## Goals / Non-Goals

**Goals:**

- Add a single `/theme-sync` command that first opens a menu overlay with only `Config` and `Status`.
- Present both config and status inside popup overlay windows built with Pi TUI components.
- Implement the overlay flow as a self-contained state machine rather than a custom widget that launches nested prompt dialogs.
- Extend config with top-level `isSyncActive`.
- Allow the config overlay to edit light theme, dark theme, polling interval, and sync status.
- Use interactive selection for theme names from currently available Pi themes inside the overlay flow.
- Validate polling interval input as numeric and greater than or equal to `1000` ms, with inline error feedback that keeps focus inside the overlay.
- Let the config workflow ask where to write each saved change using an explicit project/global write-target prompt.
- Show a status overlay with appearance, applied theme, desired theme, sync active state, detection strategy, available detectors, polling interval, last update time, last event, and warnings.
- Keep configuration application explicit by requiring `/reload` after saved or external config changes.
- Use Pi TUI overlay patterns and built-in components where they fit.

**Non-Goals:**

- Adding automatic runtime config watching.
- Applying saved config changes without `/reload`.
- Triggering `ctx.reload()` automatically from theme-sync commands.
- Requiring the user to type `/theme-sync config` or `/theme-sync status` manually as the primary flow.
- Showing config-source reporting in the status overlay.
- Building race-condition handling around in-place runtime reconfiguration, because config changes are not applied in place.

## Decisions

### Decision: Use a top-level overlay menu for `/theme-sync`

`/theme-sync` will open a popup overlay menu with exactly two options:

- `Config`
- `Status`

This makes the command discoverable and keeps the entrypoint visually simple.

### Decision: Use a self-contained overlay state machine

The menu, config view, and status view will be implemented as overlay-based UI with internal mode transitions rather than as a custom widget that opens nested `ctx.ui.select()` / `ctx.ui.input()` dialogs.

This keeps focus inside the overlay, makes Escape behavior predictable, prevents orphaned overlays, and allows inline validation feedback without bouncing the user back to the prompt.

### Decision: Keep configuration application manual and reload-driven

The extension will load configuration at startup and use it for the lifetime of the current runtime. Saving changes from the config overlay writes them to the chosen config file but does not apply them immediately. The user must run `/reload` to apply saved changes. Manual edits to config files outside Pi also require `/reload`.

This keeps theme-sync behavior aligned with Pi’s explicit reload model and avoids file-watcher complexity, implicit global reloads, and in-place runtime mutation.

### Decision: Fresh-read config from disk when opening the config overlay

Each time the user opens the config overlay, the extension will reread and parse the supported config files from disk so the displayed values reflect current on-disk configuration rather than only the startup-loaded runtime snapshot.

Once opened, the overlay owns its staged state until the user saves, reloads Pi, or closes the overlay. If the user wants to re-read files from disk without reloading runtime, they can close and reopen `/theme-sync` and choose `Config` again.

### Decision: Show config provenance in config, not in status

Config source information is useful when editing settings but noisy and confusing in a runtime inspection view. The config overlay will therefore be the place where users understand where a setting comes from, while the status overlay will focus on current runtime behavior.

### Decision: Simplify the status overlay

The status overlay will show:

- `Appearance`
- `Applied Theme`
- `Desired Theme`
- `Sync Active`
- `Detection Strategy`
- `Available Detectors`
- `Polling Interval`
- `Last Update`
- `Last Event`
- `Warnings` (when present)

`Runtime Mode` and `Config Sources` are intentionally omitted from status to reduce redundancy or move config-oriented information to the config overlay.

`Detection Strategy` will name the active approach precisely. When polling is active, it should identify the detector that currently produced the effective result rather than showing only a generic `Polling` label.

### Decision: Use simple keyboard behavior inside the overlays

Top-level menu overlay:

- `↑` / `↓` to move between `Config` and `Status` (with wrapping/looping)
- `Enter` to open the selected overlay
- `Esc` or `Ctrl+C` to close the menu

Config overlay:

- `↑` / `↓` to move between fields and actions (with wrapping/looping)
- `Enter` to activate the focused field or action
- `Ctrl+S` to save pending edits to the chosen config file
- `Ctrl+R` to trigger explicit Pi reload by issuing `/reload`
- `Esc` to go back or close the overlay
- `Ctrl+C` to quit the overlay

Status overlay:

- `Esc` to close the overlay
- `Ctrl+C` to quit the overlay

### Decision: Validate polling interval inline inside the overlay

The config overlay will validate `Polling Interval` as a number greater than or equal to `1000` milliseconds before allowing the change to be saved. Invalid input will remain inside the overlay and show an inline error message.

## Risks / Trade-offs

- **Saved config does not take effect until reload** → Make this explicit in the config overlay and documentation.
- **Users may expect external manual edits to hot-apply** → Document that `/reload` is required after any manual config edit.
- **Overlay state machines are more complex than detached prompts** → Keep the modes simple and use Pi TUI components instead of ad hoc prompt mixing.
- **Config provenance in config view adds some UI density** → Keep source indicators compact and aligned with the relevant fields.
- **Status reflects current runtime, not unsaved staged edits** → Keep status tied to loaded runtime state and treat config edits as separate until saved and reloaded.

## Migration Plan

1. Keep the config schema and README support for `isSyncActive` and manual `/reload`.
2. Replace the current command flow with a top-level `/theme-sync` menu overlay.
3. Replace the config interaction with a true overlay-based config window that owns its own state.
4. Replace the status interaction with a true overlay-based status window.
5. Preserve existing active-sync behavior when `isSyncActive` is absent by defaulting it to `true`.
6. Rollback is straightforward: remove the overlay UI flow and continue relying on startup-only config loading with no interactive surfaces.
