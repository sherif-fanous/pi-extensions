---
"@sherif-fanous/pi-presets-plus": minor
---

- Changed: Draw the picker, editor, and dialogs with the shared frames, sizes,
  and key hints. Remapped Pi keys replace the default keys instead of adding to
  them, the Tools, Scope, Thinking, and Actions rows wrap, empty states name the
  next step, and a busy line shows progress
- Changed: Head every report, and give single-sentence reports such as the one
  from `/presets clear` a heading. Warnings in a report show in the warning
  color
- Changed: Show the warnings one action finds as one notification, apart from
  its result, in the wording every extension in the family uses
- Changed: Show a failure in `/presets` or in a Presets Plus event handler as
  one Presets Plus error notification instead of Pi's generic extension error
- Changed: Name the extension Presets Plus everywhere, write scopes as User and
  Project, and shorten the descriptions of `/presets`, its subcommands, and
  `--preset`
- Changed: Answer an argument `/presets` doesn't accept with a warning that
  lists the valid forms, and warn instead of doing nothing when `/presets` runs
  outside the TUI
- Changed: Ask for the policy override confirmation in RPC clients too
- Changed: Apply `showInactiveStatus` on `/presets reload`, and name the hotkey
  changes that still need `/reload`
- Fixed: Show the chosen preset's prompt after `/presets show-prompt` instead of
  activating the preset, including names with spaces
- Fixed: Wrap footers instead of cutting them off, scroll dialogs taller than
  the window, and let Ctrl+C and remapped keys work in every overlay
- Fixed: Show the key hint that matches what `Enter` does in the picker's filter
  mode
- Fixed: Leave out the `n` hint in the policy override footer when it repeats
  `Esc Cancel`
