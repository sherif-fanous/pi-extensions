# Presets Plus

Presets Plus bundles a model, thinking level, tools, and system prompt into
presets you can switch between. The family rules are in the root `AGENTS.md` and
`docs/`; these notes apply only to this package.

- Field labels, dialog titles, and action labels shared by more than one surface
  live in `src/ui/labels.ts`. Read them from there, so one spelling reaches
  every surface.
- `SUBCOMMANDS` in `src/commands/presets/router.ts` is the one registry behind
  the completions, the dispatch, and the usage warning's forms.
