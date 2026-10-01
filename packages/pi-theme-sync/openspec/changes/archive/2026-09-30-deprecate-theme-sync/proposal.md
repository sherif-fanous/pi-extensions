# Proposal

## Why

Pi now switches themes itself. A `theme` setting of the form
`<light-theme>/<dark-theme>` follows the terminal's light or dark appearance. Pi
decides the appearance from the terminal's reported background color and
switches live through the terminal's light/dark notifications. That covers Theme
Sync's main job. The owner confirmed that their terminal switches live with
Theme Sync disabled.

Pi 0.99 also broke Theme Sync. It removed the terminal color-scheme query that
Theme Sync's primary detector and its subscription depend on, so Theme Sync
falls back to OSC 11 polling. Pi now reads terminal color replies before
extensions see them, which makes that polling racy. Every theme Theme Sync
applies through `setTheme` turns off Pi's light/dark notifications and replaces
a `<light>/<dark>` pair in the user's settings with a single theme name. Fixing
all that means working around Pi's internals on every release, for a small set
of users. The better move is to retire Theme Sync and point users at Pi's
built-in setting.

This change ships the final Theme Sync release. Removing the package from the
monorepo comes in a later, repo-wide change.

## What Changes

- Theme Sync shows a deprecation notice with the setup warnings at every session
  start. The notice gives the exact Pi `theme` value that replaces the user's
  Theme Sync mapping, built from the effective light and dark themes (for
  example `"theme": "catppuccin-latte/catppuccin-macchiato"`), and the command
  that uninstalls the package. `/theme-sync status` lists it under `Warnings:`.
- Theme Sync defers to Pi when Pi's effective `theme` setting is already a
  `<light>/<dark>` pair. It doesn't probe detectors, poll, subscribe, or change
  the theme. It shows a notice that it is deprecated, that it is standing down,
  and how to remove it. Users who switch to Pi's setting before uninstalling
  Theme Sync therefore can't have the pair overwritten. Theme Sync checks the
  setting only when Pi exposes the settings reader (Pi 0.99 and later). On an
  older Pi it keeps syncing as before.
- The README opens with a deprecation paragraph and gets a migration section
  that maps Theme Sync's configuration to Pi's `theme` setting. That section
  replaces the "Pi's built-in `auto` theme" section, whose `auto:<light>,<dark>`
  syntax is stale. The README also says that on current Pi, Theme Sync polls
  because Pi no longer offers the color-scheme query.
- A minor changeset records the deprecation notice and the deferral.
- After publishing, the owner runs `npm deprecate` on the package so that npm
  shows the notice on install.
- Detection, the configuration overlay, the configuration files, and
  `/theme-sync status` otherwise stay as they are. There are no detector fixes
  for Pi 0.99.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `theme-sync-extension`: adds the deprecation notice and the deferral to Pi's
  `<light>/<dark>` theme pair.
- `theme-sync-status`: puts the deprecation or deferral notice in the setup
  warnings notification, in a fixed position.
- `theme-sync-detection`: one-shot detection while inactive no longer runs when
  Theme Sync defers to Pi's theme pair.

## Impact

- Code: `src/index.ts` passes a theme-setting reader to the runtime.
  `src/runtime.ts` gets that seam, the deferral branch, and the notice text.
  `src/types.ts` changes only if the status needs to show the deferral.
- Tests: new runtime tests for the notice and the deferral in
  `tests/runtime-session-config.test.ts`. `tests/shown-text.test.ts` covers the
  new texts.
- Docs: `README.md`. Repository-root `.changeset/` gets a minor changeset for
  `@sherif-fanous/pi-theme-sync`.
- Dependencies: none. The Pi catalog version stays at 0.87.1. The settings
  reader is feature-detected at runtime, because 0.87.1's types don't declare
  it.
- Release: a post-publish `npm deprecate` step for the owner.
- Out of scope: removing the package from the workspace, the root
  `.pi/settings.json`, and the root README and AGENTS.md; archiving its OpenSpec
  root; filing a Pi issue about a polling fallback for terminals without
  light/dark notifications.
