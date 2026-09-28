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

No configuration is needed. Once installed, Theme Sync detects your current appearance and switches Pi between its built-in `light` and `dark` themes automatically.

Run `/theme-sync` to open the configuration overlay. Run `/theme-sync status` to add the current runtime status to the transcript.

The overlay lists the light and dark mode themes, the polling interval, and whether sync is on, each with the source of its value. Press `Enter` to change a setting, `F1` to read about it, and `Ctrl+S` to save your changes to the User or Project configuration. The footer shows the keys that work in the current step.

| Key             | Action                                    |
| :-------------- | :---------------------------------------- |
| `↑` / `↓`       | Move the selection                        |
| `PgUp` / `PgDn` | Move one page                             |
| `Enter`         | Change the selected setting               |
| `F1`            | Show help for the selected setting        |
| `Ctrl+S`        | Save changes to the User or Project file  |
| `Ctrl+R`        | Close the overlay and reload Pi           |
| `Esc`           | Close, or go back from a nested step      |

If you have remapped Pi's keys, the overlay follows your bindings.

### Relationship to Pi's built-in `auto` theme

Pi has its own automatic theme setting of the form `auto:<light-theme>,<dark-theme>`. Theme Sync does the same job with per-project configuration, custom theme mapping, and a status report, so the two are alternatives rather than complements.

Use one or the other. When Theme Sync applies a theme it calls Pi's `setTheme`, which persists a concrete theme name into your Pi settings. If your Pi `theme` setting was `auto:...`, that value is replaced by the applied theme name and Pi's built-in auto-switching stops on its own.

To go back to Pi's built-in behavior, set **Sync** to **off** in the `/theme-sync` overlay and save it (or uninstall the extension), then set your Pi `theme` setting back to `auto:<light-theme>,<dark-theme>`.

## Configuration

Theme Sync reads one `config.json` in each scope:

| Scope   | Path                                 |
| :------ | :----------------------------------- |
| User    | `~/.pi/agent/theme-sync/config.json` |
| Project | `.pi/theme-sync/config.json`         |

The Project path is relative to the directory Pi starts in.
`PI_CODING_AGENT_DIR` replaces `~/.pi/agent`. Each setting comes from the
Project file, then the User file, then the default, and an invalid value is
skipped with a warning so the next one applies. Theme Sync reads the Project
file only when Pi trusts the project; in an untrusted project it skips the file
and warns once.

```json
{
  "version": 2,
  "syncEnabled": true,
  "themes": {
    "light": "light",
    "dark": "dark"
  },
  "detection": {
    "pollIntervalMs": 2000
  }
}
```

| Key                        | Default   | Description                                                                                                                |
| :------------------------- | :-------- | :------------------------------------------------------------------------------------------------------------------------- |
| `version`                  | `2`       | Layout of the file. A file without it is read as version 2; a file with any other version is ignored with a warning        |
| `syncEnabled`              | `true`    | Whether Theme Sync switches Pi's theme to match the appearance                                                             |
| `themes.light`             | `"light"` | Pi theme for light mode. A theme Pi doesn't have is skipped with a warning; without any valid one, Theme Sync uses `light` |
| `themes.dark`              | `"dark"`  | Pi theme for dark mode. A theme Pi doesn't have is skipped with a warning; without any valid one, Theme Sync uses `dark`   |
| `detection.pollIntervalMs` | `2000`    | How often, in milliseconds, Theme Sync checks the appearance, from 1000 to 60000                                           |

Pi reads this file at session start. Run `/reload` after editing it. Saving from
the `/theme-sync` overlay writes the file but doesn't change the running session
either; press `Ctrl+R` in the overlay to reload Pi and apply your changes.
`/theme-sync status` lists each file with its state: `loaded`, `not found`,
`invalid` with the reason, or `skipped (untrusted)`.

### Migrating from 0.5 and earlier

Theme Sync 0.5 read `theme-sync/settings.json`, or `theme-sync.json` one
directory up when that was missing, and called the sync setting `isSyncActive`.
At session start, Theme Sync moves the file each scope used to
`theme-sync/config.json`, renames `isSyncActive` to `syncEnabled`, adds
`version`, and deletes the old file once the new one is written. It shows one
message naming the new files. It also renames `isSyncActive` in a `config.json`
you wrote by hand.

A scope that already has a `config.json` is left alone, and a Project file moves
only when Pi trusts the project. When both old files exist, only `settings.json`
moves; `theme-sync.json`, which 0.5 already ignored, stays and you can delete
it.

If an old file can't be read or isn't a JSON object, Theme Sync warns, leaves
the file where it is, and uses the other scope and the defaults. Fix the file
and run `/reload` to migrate it, or copy its settings into `config.json`
yourself.

## How it works

### Initial detection

On startup, Theme Sync determines the current appearance by probing three detection methods in order and using the first one that returns a result:

```text
Terminal Color Scheme  ← asks Pi's terminal API for light/dark mode
    ↓
OSC 11                 ← reads terminal background color, classifies as light/dark
    ↓
System Appearance      ← reads system appearance (macOS, Linux/GNOME, Windows)
```

These names appear in the `/theme-sync status` report's `Detection strategy:` and `Available detectors:` rows.

### Ongoing updates

After determining the initial appearance, Theme Sync keeps Pi in sync using the best available method:

```text
Terminal Color Scheme (subscription) available?
    ├─ yes → listen for real-time terminal appearance notifications
    └─ no  → poll available detectors at the configured interval
```

When real-time terminal notifications are available, Theme Sync also keeps Pi on the theme that matches the last detected appearance. If Pi's active theme is changed manually while the detected appearance stays the same, the extension switches it back automatically.

Pi's built-in `auto:light,dark` theme mode and Theme Sync can use the same terminal notifications safely. The extension removes only its own listener during `/reload`, `/new`, or shutdown and does not disable Pi's notification channel. While Theme Sync is active, the extension's configured theme mapping remains authoritative.

When polling, all available detectors are tried in priority order on each cycle. If a higher-priority detector fails transiently, lower-priority detectors still provide a result.
