# pi-theme-sync

A [Pi](https://github.com/badlogic/pi) coding agent extension that automatically switches Pi's theme to match your terminal or operating system appearance.

## Install

```shell
pi install npm:@sherif-fanous/pi-theme-sync
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

No configuration is needed. Once installed, `pi-theme-sync` detects your current appearance and switches Pi between its built-in `light` and `dark` themes automatically. To map appearances to custom themes instead, see [Configuration](#configuration).

## Configuration

Create a configuration file to map light and dark appearances to specific Pi themes.

`pi-theme-sync` looks for configuration in this order:

1. **Project config** (`.pi/theme-sync.json`) - project-specific settings
2. **Global config** — `~/.pi/agent/theme-sync.json` - user preferences
3. **Built-in defaults** — Pi's `light` and `dark` themes

This means project config overrides global config, and global config overrides built-in defaults.

### Example

```json
{
  "themes": {
    "light": "catppuccin-latte",
    "dark": "catppuccin-macchiato"
  },
  "detection": {
    "pollIntervalMs": 2000
  }
}
```

| Field                      | Default   | Description                                                                              |
| -------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| `themes.light`             | `"light"` | Pi theme to use when light appearance is detected                                        |
| `themes.dark`              | `"dark"`  | Pi theme to use when dark appearance is detected                                         |
| `detection.pollIntervalMs` | `2000`    | Polling interval in milliseconds (used when subscription-based detection is unavailable) |

If a configured theme name does not exist in Pi, `pi-theme-sync` falls back to the corresponding built-in theme (`light` or `dark`).

## How it works

### Initial detection

On startup, `pi-theme-sync` determines the current appearance by probing three detection methods in order and using the first one that returns a result:

```text
DSR 996/997  ← asks the terminal directly for light/dark mode
    ↓
OSC 11       ← reads terminal background color, classifies as light/dark
    ↓
OS setting   ← reads system appearance (macOS, Linux/GNOME, Windows)
```

### Ongoing updates

After determining the initial appearance, `pi-theme-sync` keeps Pi in sync using the best available method:

```text
DEC mode 2031 supported?
    ├─ yes → listen for real-time terminal appearance notifications
    └─ no  → poll available detectors at the configured interval
```

When real-time terminal notifications are available, `pi-theme-sync` also keeps Pi on the theme that matches the last detected appearance. If Pi's active theme is changed manually while the detected appearance stays the same, the extension switches it back automatically.

When polling, all available detectors are tried in priority order on each cycle. If a higher-priority detector fails transiently, lower-priority detectors still provide a result.
