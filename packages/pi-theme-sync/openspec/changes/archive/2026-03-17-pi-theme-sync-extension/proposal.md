## Why

Pi currently ships only a minimal macOS-only example for syncing themes with system appearance, and that example relies on AppleScript polling. That approach breaks down in sandboxed environments and does not provide a cross-platform path for users who want Pi to follow terminal or OS appearance automatically.

## What Changes

- Add a Pi package that provides an extension for automatic Pi theme switching between light and dark themes.
- Support configuration from both global `~/.pi/agent/theme-sync.json` and project `.pi/theme-sync.json`, merging onto defaults with project values overriding global values per key.
- Allow users to map logical `light` and `dark` appearance states to Pi theme names via JSON configuration.
- Detect appearance using built-in polling detectors for DSR 996/997, OSC 11 background queries, and OS appearance fallback.
- Probe available polling detectors and available subscription detectors separately, determine current appearance from available polling detectors in priority order, and subscribe to DEC mode 2031 notifications when available.
- When DEC mode 2031 is unavailable, poll all available fallback detectors in priority order on each interval and use the first detector that returns a concrete appearance.
- Provide safe fallback behavior when configured theme names do not exist by falling back to Pi built-in themes `light` and `dark`.
- Keep the extension visually quiet during normal operation with no persistent UI or slash-command diagnostics in v1.

## Capabilities

### New Capabilities

- `theme-sync-extension`: A Pi package extension that automatically switches Pi themes to match detected terminal or OS appearance.
- `theme-sync-configuration`: Configuration loading, precedence, validation, and fallback behavior for light/dark theme mappings and polling settings.
- `theme-sync-detection`: Polling-detector startup detection with DEC mode 2031 subscription fallback behavior for ongoing updates.

### Modified Capabilities

- None.

## Impact

- New Pi package structure with an extension and supporting configuration-loading logic.
- New documentation for installation, configuration, fallback behavior, and supported terminal control sequences.
- Uses Pi extension runtime theme APIs (`ctx.ui.setTheme`, theme enumeration) and raw terminal input support for terminal control sequence handling in interactive mode.
- Introduces OS-specific fallback detection commands/APIs for macOS, Linux, and Windows, with terminal-first behavior as the canonical detection flow.
