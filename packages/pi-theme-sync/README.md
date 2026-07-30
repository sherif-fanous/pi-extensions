# pi-theme-sync

A [Pi](https://github.com/badlogic/pi) coding agent extension that automatically switches Pi's theme to match your terminal or operating system appearance.

## Install

```shell
pi install npm:@sherif-fanous/pi-theme-sync
```

Version 0.4.0 and later supports Pi 0.79.7 or newer. If you run an older Pi version, pin the previous release line instead:

```shell
pi install npm:@sherif-fanous/pi-theme-sync@0.3.x
```

Or try it without installing:

```shell
pi -e npm:@sherif-fanous/pi-theme-sync
```

To uninstall:

```shell
pi remove npm:@sherif-fanous/pi-theme-sync
```

## Quick start

No configuration is needed. Once installed, `pi-theme-sync` detects your current appearance and switches Pi between its built-in `light` and `dark` themes automatically.

Run `/theme-sync` to open an interactive overlay menu with `Config` and `Status` options.

### Relationship to Pi's built-in `auto` theme

Pi has its own automatic theme setting of the form `auto:<light-theme>,<dark-theme>`. `pi-theme-sync` does the same job with per-project configuration, custom theme mapping, and a status overlay, so the two are alternatives rather than complements.

Use one or the other. When `pi-theme-sync` applies a theme it calls Pi's `setTheme`, which persists a concrete theme name into your Pi settings. If your Pi `theme` setting was `auto:...`, that value is replaced by the applied theme name and Pi's built-in auto-switching stops on its own.

To go back to Pi's built-in behavior, set `isSyncActive` to `false` in the `/theme-sync` Config overlay (or uninstall the extension), then set your Pi `theme` setting back to `auto:<light-theme>,<dark-theme>`.

## Configuration

`pi-theme-sync` looks for configuration in this order:

1. **Project config** (`.pi/theme-sync.json`) — project-specific settings
2. **Global config** (`~/.pi/agent/theme-sync.json`) — user preferences
3. **Built-in defaults** — Pi's `light` and `dark` themes plus active sync enabled

Project config overrides global config, and global config overrides built-in defaults, on a per-key basis.

### Example

```json
{
  "isSyncActive": true,
  "themes": {
    "light": "catppuccin-latte",
    "dark": "catppuccin-macchiato"
  },
  "detection": {
    "pollIntervalMs": 2000
  }
}
```

| Field                      | Default   | Description                                                                 |
| -------------------------- | --------- | --------------------------------------------------------------------------- |
| `isSyncActive`             | `true`    | Whether the extension actively applies mapped themes in the current runtime |
| `themes.light`             | `"light"` | Pi theme to use when light appearance is detected                           |
| `themes.dark`              | `"dark"`  | Pi theme to use when dark appearance is detected                            |
| `detection.pollIntervalMs` | `2000`    | Polling interval in milliseconds (must be >= 1000)                          |

If a configured theme name does not exist in Pi, `pi-theme-sync` falls back to the corresponding built-in theme (`light` or `dark`).

## Reload behavior

Configuration changes are **not** applied automatically. Saving changes from the config overlay, or manually editing config files, writes to disk only. To apply changes, run:

```shell
/reload
```

## How it works

### Initial detection

On startup, `pi-theme-sync` determines the current appearance by probing three detection methods in order and using the first one that returns a result:

```text
Terminal Color Scheme  ← asks Pi's terminal API for light/dark mode
    ↓
OSC 11                 ← reads terminal background color, classifies as light/dark
    ↓
System Appearance      ← reads system appearance (macOS, Linux/GNOME, Windows)
```

These names appear in the Status overlay's `Detection Strategy:` and `Available Detectors:` rows.

### Ongoing updates

After determining the initial appearance, `pi-theme-sync` keeps Pi in sync using the best available method:

```text
Terminal Color Scheme (subscription) available?
    ├─ yes → listen for real-time terminal appearance notifications
    └─ no  → poll available detectors at the configured interval
```

When real-time terminal notifications are available, `pi-theme-sync` also keeps Pi on the theme that matches the last detected appearance. If Pi's active theme is changed manually while the detected appearance stays the same, the extension switches it back automatically.

Pi's built-in `auto:light,dark` theme mode and `pi-theme-sync` can use the same terminal notifications safely. The extension removes only its own listener during `/reload`, `/new`, or shutdown and does not disable Pi's notification channel. While theme sync is active, the extension's configured theme mapping remains authoritative.

When polling, all available detectors are tried in priority order on each cycle. If a higher-priority detector fails transiently, lower-priority detectors still provide a result.
