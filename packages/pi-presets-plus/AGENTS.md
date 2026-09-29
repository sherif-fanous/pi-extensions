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
  compiled user policy's rules, and every warning (settings, presets, and both
  policies) in `config`, which session start, `/presets reload`, status, and
  `/presets policy` show. Activation never reports policy warnings. A caller
  that already holds the result passes it to `activate` as `config` instead of
  reading the file again. A save reads only its own scope, and refuses when any
  section of that file has a warning.
- Every activation goes through `activate(ctx, pi, session, request)` in
  `src/activation/activate.ts`, and session start's restore, `--preset`, and
  policy default through `activateAtStartup` there. The request gives the
  preset, or its name, and the trigger (`command`, `flag`, `hotkey`, `picker`),
  which decides the wording and where warnings go. A name alone resolves through
  `findPresetByName`, the one project-then-user rule, which `show-prompt` uses
  too. Callers keep only their parsing and their own UI.
- `ActivePresetSession` in `src/activation/session.ts` holds the one record of
  the active preset: what it declared and, unless it was reattached from the
  session branch, the baseline and the values its overlay wrote. It makes every
  model, thinking level, and tools write (`apply`, `clear`) inside its
  self-trigger guard, which the drift handlers check. `assess(ctx, pi)` reads Pi
  once and is the one comparison with the active preset: drift reasons for the
  badge and the picker, and each field's classification for status and clear.
  Read Pi's state through it rather than comparing it by hand; `decideClear`
  stays a pure function of the assessment.
- Deleting the active preset leaves the session attached on purpose:
  `/presets clear` still needs the record to restore the baseline. The badge
  keeps the name and status reports the preset as no longer loaded.
