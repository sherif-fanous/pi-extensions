---
"@sherif-fanous/pi-rtk": minor
---

- Changed: Show the real state in the footer: dim `RTK: on` while rewriting is
  on and the rtk binary runs, dim `RTK: off` while rewriting is off, and
  `RTK: unavailable` in the warning color when the rtk binary is missing from
  PATH or can't run. The footer used to show a green `rtk ✓` even when rtk was
  missing
- Changed: Show `/rtk status` as an RTK Status report in the transcript, with
  aligned `Rewriting:`, `Binary:`, and `Tip:` rows, that stays after a reload.
  Outside the TUI the same report arrives as a notification
- Changed: Show the `/rtk status` report for a bare `/rtk` in print and JSON
  mode, which have no menu, instead of doing nothing
- Changed: Title the bare `/rtk` menu with the current state, and describe
  `/rtk` and each subcommand in its completions
- Changed: Answer an unknown `/rtk` subcommand with a warning that lists the
  valid forms
- Changed: Show a failure in `/rtk` or in RTK's startup or shell-command
  handling as one RTK error notification, and run a `!<cmd>` command unchanged
  when its rewrite fails
- Changed: Head the warning about an unreachable rtk binary with RTK
- Fixed: Describe `/rtk enable` and `/rtk disable` as lasting until Pi restarts,
  which they always did, instead of for the current session
