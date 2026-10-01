# Design

## Context

See proposal.md for why. This section covers only what shapes the approach.

- `createThemeSyncRuntime({ detectors, schedule })` in `src/runtime.ts` owns
  session start. `startAppearanceMonitoring` loads the config, probes detectors,
  runs the startup poll, and then either stops (sync off) or starts the
  subscription or polling. `startSession` then calls
  `configOutcome.notify(ctx, warnings)`. Core's `ConfigOutcome.notify` lists its
  own migration, file, and invalid-value warnings first and the `extras` (the
  runtime's `warnings`) after them.
- The runtime sees only `ExtensionContext`. The settings reader lives on
  `ExtensionAPI`: `pi.getSettings()` in Pi 0.99.2, which returns the merged
  global and project settings, including `theme?: string`. The workspace catalog
  pins `@earendil-works/pi-coding-agent` 0.87.1, whose types don't declare
  `getSettings`.
- Pi treats a `theme` value as a light/dark pair when it has exactly one `/` and
  a non-empty trimmed name on each side (`parseAutoThemeSetting` in Pi's
  `theme.js`).
- Every `ctx.ui.setTheme(name)` call runs Pi's `setThemeName`, which turns off
  Pi's auto-sync, and then saves `name` as the `theme` setting. That is how a
  pair gets overwritten.
- Tests drive the runtime through its seams with the fakes in
  `tests/helpers/fake-detectors.ts`, as the package AGENTS.md requires.

## Goals / Non-Goals

**Goals:**

- The final release never overwrites a user's `<light>/<dark>` pair.
- The final release sends no terminal queries when Pi already handles switching,
  so it can't race Pi's color query at startup.
- A user can migrate by copying one value out of the notice.

**Non-Goals:**

- Fixing detection on Pi 0.99: no `queryTerminalColors` adoption, no re-check of
  the 2031 subscription, and no removal of the
  `Terminal color-scheme API is unavailable` warning. The notice tells users to
  leave, so fixes there go unused.
- Writing Pi's settings for the user, such as a `/theme-sync migrate` command.
  Extensions have no settings writer, and editing Pi's `settings.json` from an
  extension would mean duplicating Pi's scope and file handling.
- Bumping the Pi catalog. That touches every package and belongs to the removal
  change or a Renovate update.

## Decisions

### A theme-setting reader seam on the runtime

Add `readThemeSetting?: () => string | undefined` to `ThemeSyncRuntimeOptions`,
defaulting to `() => undefined` (never defer). `src/index.ts` builds the real
one from `pi`:

```ts
const getSettings = (pi as { getSettings?: () => { theme?: unknown } })
  .getSettings;
readThemeSetting: () => {
  try {
    const theme = getSettings?.call(pi).theme;
    return typeof theme === "string" ? theme : undefined;
  } catch {
    return undefined;
  }
};
```

- **Why a seam:** it keeps with the package rule of testing the runtime through
  `createThemeSyncRuntime` options. Tests pass a plain function and need no fake
  `pi.getSettings`.
- **Why feature detection:** the catalog's 0.87.1 types don't have
  `getSettings`, and bumping the catalog is out of scope. A structural cast
  confined to `index.ts` is the smallest type escape.
- **Alternative rejected:** reading `settings.json` from `getAgentDir()` and the
  project `.pi/`. That duplicates Pi's merge, trust, and override rules and
  would disagree with Pi when overrides such as `--use-theme` apply.

### Decide deferral right after loading the config, before probing

In `startAppearanceMonitoring`, after `loadStartupConfig`:

1. Read the setting. If it is a pair (see "Detecting a pair" below), set
   `detectionStrategy = "Inactive"`, set `currentAppearance = "unknown"`, run
   `markEvent("Deferred to Pi's theme setting")`, push the deferral notice onto
   `warnings`, and return. Nothing probes, polls, subscribes, or calls
   `setTheme`.
2. Otherwise push the deprecation notice onto `warnings` first, then continue
   exactly as today.

- **Why before probing:** probing sends OSC 11 and DECRQM queries, which are the
  startup race. Deferral has no use for detection.
- **Why the notice goes first in `warnings`:** core puts `extras` after its own
  warnings, so pushing the notice before `probeDetectors` runs places it between
  the invalid-value warnings and the detector warnings, which is the order the
  status spec requires. No core change is needed.
- **Sync row while deferring:** `getStatus` reads `runtimeConfig.syncEnabled`.
  Deferral reports sync `off` without changing the loaded config. Either keep a
  `deferred` flag that `getStatus` and `applyMappedTheme` check, or copy the
  config with `syncEnabled: false`. The flag is clearer, because the config
  block still shows what the files say.

### Detecting a pair

Write a local `isThemePair(value)` that mirrors Pi's rule: split on `/`, require
exactly two parts, and require both to be non-empty after trimming. Pi doesn't
export its parser from the package entry point, so importing it is not an
option.

### Notice texts are constants built from the effective mapping

Both texts live next to the runtime's other warning strings. The deprecation
notice interpolates `runtimeConfig.themes.light` and `runtimeConfig.themes.dark`
after the merge, so it names the themes the user actually runs. The deferral
notice interpolates the raw setting. Both go through the setup warnings
notification (severity `warning`, because the user can act on them) and appear
under `Warnings:` in `/theme-sync status`.

### README

- Right after the lead sentence, with no heading of its own, comes the
  deprecation block, so readers see how to migrate first. A `##` section there
  would break the family README order in `extension-packaging`. The block:
  1. Says Pi switches themes itself since 0.79.7 when `theme` is a
     `<light>/<dark>` pair, with a version table: 0.99.0 and later move to Pi's
     setting; 0.79.7 to 0.87.1 can keep Theme Sync or move; before 0.79.7 keep
     Theme Sync.
  2. Steps: set Pi's `theme` to `<light>/<dark>` from `themes.light` and
     `themes.dark` (a Project file maps to that project's `.pi/settings.json`),
     run `pi remove npm:@sherif-fanous/pi-theme-sync`, and delete
     `~/.pi/agent/theme-sync/` and any `.pi/theme-sync/`.
  3. Says that until the package is removed, Theme Sync stands down on its own
     once the pair is set.
  4. Mentions the one case Pi doesn't cover: terminals without live light/dark
     reports only get the right theme when Pi starts.
- Remove `### Pi's built-in auto theme`.
- Replace the `Tested only against the latest stable release` line in
  `## Requirements` with `Pi 0.87.1 or earlier for full support`, pointing Pi
  0.99.0 and later at Pi's setting. This is a deliberate exception to
  `docs/readme.md` and the `extension-packaging` spec for a deprecated package.
- In `## How it works`, fix the `auto:light,dark` mention and say that current
  Pi no longer offers the color-scheme query, so Theme Sync uses OSC 11 or the
  system appearance.
- Leave `package.json` `description` alone. The shown-text and packaging rules
  fix its shape, and `npm deprecate` carries the notice on npm.

## Risks / Trade-offs

- [A notice at every session start annoys users who can't migrate yet] →
  Accepted. The notice is the point of the release, and it disappears once the
  pair is set or the package is removed.
- [`pi.getSettings` is undocumented and could change] → Feature-detect it and
  catch errors, so a missing or broken reader falls back to today's behavior.
  Only deferral depends on it.
- [On Pi before 0.99 there is no reader, so an unremoved Theme Sync can still
  overwrite a pair there] → Accepted. The notice tells users to uninstall, and
  the README tells them to remove the package before or right after setting the
  pair.
- [Users who relied on OSC 11 polling or the system appearance fallback lose
  live switching after migrating] → The README says so. Pi still picks the right
  theme at startup on those terminals.

## Migration Plan

1. Implement, add a minor changeset (`Added:` for the notice, `Changed:` for the
   deferral), and pass `mise run check`.
2. Release through the usual `mise run version` and `mise run publish`.
3. The owner runs
   `npm deprecate @sherif-fanous/pi-theme-sync "Pi now switches themes itself. Set theme to <light>/<dark> in Pi's settings and remove this package."`.
4. Later, a repo-wide change in the root `openspec/` removes the package from
   the workspace and the root `.pi/settings.json`, README, and AGENTS.md.

Rollback: `npm undeprecate`, where the npm registry supports it, or
`npm deprecate … ""`, plus a patch release without the notice.
