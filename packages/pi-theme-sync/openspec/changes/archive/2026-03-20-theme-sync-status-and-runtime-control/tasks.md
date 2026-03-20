## 1. Config loading and runtime state

- [x] 1.1 Extend config types and defaults to support top-level `isSyncActive`
- [x] 1.2 Refactor config loading to return effective values plus per-field config-source metadata
- [x] 1.3 Add config read/write helpers that can update either project or global config while preserving existing file content
- [x] 1.4 Introduce a central runtime state model for appearance, desired/applied theme, detection strategy, sync status, last update, warnings, and config-source reporting

## 2. Overlay command flow and UI

- [x] 2.1 Replace the current `/theme-sync` subcommand parsing flow with a top-level overlay menu offering `Config` and `Status`
- [x] 2.2 Implement a true overlay-based config window that owns its state and does not rely on nested `ctx.ui.select()` or `ctx.ui.input()` inside the overlay event loop
- [x] 2.3 Implement config-window editing for light theme, dark theme, and sync status inside the overlay flow
- [x] 2.4 Implement polling-interval editing with inline validation inside the overlay, enforcing values greater than or equal to `1000`
- [x] 2.5 Implement a save flow from the config overlay that prompts for `Project (<path>)` or `Global (<path>)` before writing config changes
- [x] 2.6 Implement config-overlay keybindings for navigation, activation, save (`Ctrl+S`), explicit reload (`Ctrl+R`), and close (`Esc`)
- [x] 2.7 Implement a popup overlay status window for runtime inspection
- [x] 2.8 Implement status-overlay rendering for appearance, applied theme, desired theme, sync active state, detection strategy, available detectors, polling interval, last update time, last event, and warnings
- [x] 2.9 Implement status-overlay dismissal behavior with `Esc`

## 3. Documentation and verification

- [x] 3.1 Update README command docs so `/theme-sync` is documented as opening a top-level menu that leads to overlay windows for config and status
- [x] 3.2 Preserve documentation that both saved config changes and external config edits require `/reload` before taking effect
- [x] 3.3 Verify menu overlay behavior, config overlay behavior, inline validation, status overlay behavior, mixed-source config reporting, and startup behavior after `/reload`
