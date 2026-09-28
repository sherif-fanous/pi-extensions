# Presets Plus

Presets Plus bundles a model, thinking level, tools, and system prompt into
presets you can switch between. The family rules are in the root `AGENTS.md` and
`docs/`; these notes apply only to this package.

- Field labels, dialog titles, and action labels shared by more than one surface
  live in `src/ui/labels.ts`. Read them from there, so one spelling reaches
  every surface.
- `SUBCOMMANDS` in `src/commands/presets/router.ts` is the one registry behind
  the completions, the dispatch, and the usage warning's forms.
- Read and save `config.json` only through `PRESETS_PLUS_CONFIG`, the core
  config handle `src/store/config.ts` defines. Session start adds the version 1
  migration to the loaded outcome and passes its other startup warnings
  (restore, `--preset`, policy, hotkeys) to `notify` as extras.
- An operation reads its configuration once, with `loadPresetsConfig(ctx)` in
  `src/store/api.ts`. The result holds the merged presets, the settings, the
  compiled user policy, and each warning where it shows: `config` for session
  start, `/presets reload`, and status, and `policy.warnings` for the activation
  gate, the startup default, and `/presets policy`. Pass its `policy` to
  activation instead of reading the file again. A save reads only its own scope,
  and refuses when any section of that file has a warning.
