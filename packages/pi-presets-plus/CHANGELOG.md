# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.13.0] - 2026-09-29

### Changed

- **Breaking:** Read the Project configuration only when Pi trusts the project.
  In an untrusted project, Presets Plus skips the file with one warning and
  refuses to save to it
- Draw the picker, editor, and dialogs with the shared frames, sizes, and key
  hints. Remapped Pi keys replace the default keys instead of adding to them,
  the Tools, Scope, Thinking, and Actions rows wrap, empty states name the next
  step, and a busy line shows progress
- Head every report, and give single-sentence reports such as the one from
  `/presets clear` a heading. Warnings in a report show in the warning color
- Show the warnings one action finds as one notification, apart from its result,
  in the wording every extension in the family uses
- Show a failure in `/presets` or in a Presets Plus event handler as one Presets
  Plus error notification instead of Pi's generic extension error
- Name the extension Presets Plus everywhere, write scopes as User and Project,
  and shorten the descriptions of `/presets`, its subcommands, and `--preset`
- Answer an argument `/presets` doesn't accept with a warning that lists the
  valid forms, and warn instead of doing nothing when `/presets` runs outside
  the TUI
- Ask for the policy override confirmation in RPC clients too
- Apply `showInactiveStatus` on `/presets reload`, and name the hotkey changes
  that still need `/reload`
- Show configuration warnings at session start and after `/presets reload`,
  instead of every time the picker opens
- Load a `config.json` without `version` as version 2
- Update `@sherif-fanous/pi-extensions-core` to 0.1.0

### Added

- Add a `Config:` block to `/presets status` with each file's path and state

### Fixed

- Stop cutting off the end of a field in the preset editor with `…` beside the
  arrow that shows the form scrolls
- Show the chosen preset's prompt after `/presets show-prompt` instead of
  activating the preset, including names with spaces
- Wrap footers instead of cutting them off, scroll dialogs taller than the
  window, and let Ctrl+C and remapped keys work in every overlay
- Show the key hint that matches what `Enter` does in the picker's filter mode
- Leave out the `n` hint in the policy override footer when it repeats
  `Esc Cancel`
- Warn in the preset editor that a hotkey is already used only when another
  preset would get the key, not when the preset you edit comes first and keeps
  it, or when the other preset is a User preset that a Project preset of the
  same name replaces
- Stop asking you to run `/reload` in the preset editor when a hotkey changes
  only in case or modifier order, such as `Ctrl+P` to `ctrl+p`
- Show warnings about the User policy once with the other configuration warnings
  at session start, after `/presets reload`, and in `/presets status`, instead
  of on every activation, twice when a `--preset` activation was cancelled, and
  never when Pi restored a session
- Mark the active preset as changed when you turn tools on after activating a
  preset whose tools Pi doesn't have, matching what `/presets status` already
  reported
- Apply a preset again when you activate it after changing the tools it carried
  over from an earlier preset, instead of marking it unchanged until the next
  turn
- Stop re-applying the active preset and repeating the ignored-tools warning
  when you activate it again and it names a tool Pi doesn't have

## [0.12.1] - 2026-09-27

### Added

- List every permitted preset that matches the directory default in
  `/presets policy` when more than one does
  ([#47](https://github.com/sherif-fanous/pi-presets-plus/pull/47))

### Removed

- Remove the footnote about confirming the override, and its asterisk, from
  `/presets policy`
  ([#48](https://github.com/sherif-fanous/pi-presets-plus/pull/48))

## [0.12.0] - 2026-09-15

### Changed

- **Breaking:** Stop applying directory defaults automatically in print, JSON,
  and RPC sessions; keep explicit `--preset` activation and preset restoration
  available ([#45](https://github.com/sherif-fanous/pi-presets-plus/pull/45))
- **Breaking:** Apply automatic directory defaults in interactive sessions only
  when the startup provider, model, and thinking level match saved Pi defaults,
  including trusted project overrides
  ([#45](https://github.com/sherif-fanous/pi-presets-plus/pull/45))
- Skip automatic directory defaults without a warning when saved defaults cannot
  be read or resolved
  ([#45](https://github.com/sherif-fanous/pi-presets-plus/pull/45))

## [0.11.0] - 2026-09-13

### Changed

- Store presets, settings, and user policy in one configuration file per scope
  ([#43](https://github.com/sherif-fanous/pi-presets-plus/pull/43))
- Migrate valid legacy configuration, preset, and policy files into the new
  configuration automatically, then delete the migrated legacy files
  ([#43](https://github.com/sherif-fanous/pi-presets-plus/pull/43))
- Leave legacy files unchanged when migration cannot complete
  ([#43](https://github.com/sherif-fanous/pi-presets-plus/pull/43))

## [0.10.0] - 2026-09-13

### Added

- Add an option to hide `Preset: none` from the footer when no preset is active
  ([#41](https://github.com/sherif-fanous/pi-presets-plus/pull/41))

## [0.9.0] - 2026-09-10

### Changed

- Open the picker with the cursor on the active preset instead of the first one
  in the list ([#37](https://github.com/sherif-fanous/pi-presets-plus/pull/37))
- Place the active preset in the middle of the picker instead of at the bottom
  edge, so the presets around it stay in view
  ([#38](https://github.com/sherif-fanous/pi-presets-plus/pull/38))

## [0.8.0] - 2026-09-10

### Added

- Search providers and models by name and version with `Enter` on either row in
  the preset editor, while keeping left/right cycling available
  ([#35](https://github.com/sherif-fanous/pi-presets-plus/pull/35))

## [0.7.1] - 2026-09-10

### Fixed

- Scroll continuously across the first and last presets without jumping to the
  opposite end of the list
  ([#33](https://github.com/sherif-fanous/pi-presets-plus/pull/33))
- Wrap PgUp and PgDn navigation in both list and filter modes
  ([#33](https://github.com/sherif-fanous/pi-presets-plus/pull/33))

## [0.7.0] - 2026-09-05

### Added

- Add Pi's `max` thinking level to preset storage, activation, editing, and
  picker display; require Pi 0.80.6 or newer only when using `max`
  ([#20](https://github.com/sherif-fanous/pi-presets-plus/pull/20)) (Tiago
  Luchini)

### Fixed

- Keep preset status and clearing aligned with Pi when a model supports neither
  the requested thinking level nor `off`
  ([#20](https://github.com/sherif-fanous/pi-presets-plus/pull/20)) (Sherif
  Fanous)

## [0.6.1] - 2026-09-05

### Fixed

- Prevent edits, removals, reordering, and scope changes from overwriting preset
  files that cannot be loaded completely
  ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Check both preset files before moving a preset between scopes and attempt to
  restore the destination if removing the source fails
  ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Restore remaining baseline settings and detach an active preset even when Pi
  cannot restore the previous model
  ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Report unexpected picker and editor action failures instead of leaving the
  failed operation unexplained
  ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Keep the selected preset visible during picker navigation when cards have
  different heights
  ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Treat repeated tool names as one tool when detecting drift and clearing a
  preset ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))

## [0.6.0] - 2026-09-03

### Changed

- **Breaking:** Require Pi `0.80.5` or newer
  ([#27](https://github.com/sherif-fanous/pi-presets-plus/pull/27))
- Keep preset status and policy reports visible in the TUI without adding them
  to LLM context, while sending them as notifications in RPC mode
  ([#27](https://github.com/sherif-fanous/pi-presets-plus/pull/27))
- Send one output for each preset activation, clear result, and startup warning
  instead of mixing notifications, overlays, and session messages
  ([#27](https://github.com/sherif-fanous/pi-presets-plus/pull/27))

## [0.5.2] - 2026-09-03

### Fixed

- Remove the duplicate success notification from policy default activation
  ([#25](https://github.com/sherif-fanous/pi-presets-plus/pull/25))

## [0.5.1] - 2026-08-31

### Changed

- Show allowed presets, prohibited presets, and the selected default in
  `/presets policy` instead of exposing policy rule details
  ([#23](https://github.com/sherif-fanous/pi-presets-plus/pull/23))

## [0.5.0] - 2026-08-30

### Added

- Add directory-specific rules that allow or prohibit presets by name, provider,
  or `provider/model`, with confirmation before overriding a prohibition
  ([#21](https://github.com/sherif-fanous/pi-presets-plus/pull/21))
- Select an optional permitted default preset for fresh sessions after checking
  the `--preset` flag and session restore
  ([#21](https://github.com/sherif-fanous/pi-presets-plus/pull/21))
- Show matching rules, combined allow and prohibit sets, and the resolved
  default through `/presets policy`
  ([#21](https://github.com/sherif-fanous/pi-presets-plus/pull/21))

## [0.4.0] - 2026-06-04

### Added

- Show the active preset and its scope on a fixed picker row, including when its
  card is outside the visible or filtered list
  ([#18](https://github.com/sherif-fanous/pi-presets-plus/pull/18))

## [0.3.0] - 2026-06-02

### Changed

- Open a prefilled editor when duplicating a preset and save the copy only after
  confirmation ([#16](https://github.com/sherif-fanous/pi-presets-plus/pull/16))

## [0.2.1] - 2026-05-31

### Changed

- Refactor preset editing, picker actions, and clear and status comparisons into
  focused modules without changing user-visible behavior
  ([#13](https://github.com/sherif-fanous/pi-presets-plus/pull/13),
  [#14](https://github.com/sherif-fanous/pi-presets-plus/pull/14))

## [0.2.0] - 2026-05-12

### Changed

- **Breaking:** Target Pi from the `@earendil-works` npm scope and require Pi
  `0.74.0` or newer
  ([#9](https://github.com/sherif-fanous/pi-presets-plus/pull/9))

## [0.1.4] - 2026-05-11

### Fixed

- Keep the selected picker card visible while navigating across cards with
  different heights
  ([#7](https://github.com/sherif-fanous/pi-presets-plus/pull/7))

## [0.1.3] - 2026-05-10

### Added

- Add `/presets show-prompt [name]` for viewing a preset's system prompt without
  activating it ([#5](https://github.com/sherif-fanous/pi-presets-plus/pull/5))

### Fixed

- Open Pi's multi-line editor from the Prompt row so long prompts remain
  reachable and editable
  ([#5](https://github.com/sherif-fanous/pi-presets-plus/pull/5))

## [0.1.2] - 2026-05-09

### Fixed

- Show "No preset is active." instead of opening a clear confirmation when no
  preset is active
  ([#3](https://github.com/sherif-fanous/pi-presets-plus/pull/3))
- Use warning severity when a preset hotkey shadows a Pi built-in
  ([#2](https://github.com/sherif-fanous/pi-presets-plus/pull/2))

## [0.1.1] - 2026-05-09

### Changed

- Refactor active-preset state, runtime hotkeys, and clear summaries into
  dedicated modules without changing user-visible behavior
  ([#1](https://github.com/sherif-fanous/pi-presets-plus/pull/1))

## [0.1.0] - 2026-05-09

_Initial release._

[0.13.0]:
  https://github.com/sherif-fanous/pi-extensions/releases/tag/%40sherif-fanous%2Fpi-presets-plus%400.13.0
[0.12.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.12.1
[0.12.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.12.0
[0.11.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.11.0
[0.10.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.10.0
[0.9.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.9.0
[0.8.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.8.0
[0.7.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.7.1
[0.7.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.7.0
[0.6.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.6.1
[0.6.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.6.0
[0.5.2]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.5.2
[0.5.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.5.1
[0.5.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.5.0
[0.4.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.4.0
[0.3.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.3.0
[0.2.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.2.1
[0.2.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.2.0
[0.1.4]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.4
[0.1.3]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.3
[0.1.2]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.2
[0.1.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.1
[0.1.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.0
