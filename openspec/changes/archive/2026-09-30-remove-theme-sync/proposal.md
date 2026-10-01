# Proposal

## Why

Theme Sync 0.7.0, its final release, is published, and every version is
deprecated on npm. Pi now switches themes itself, so the package needs no more
work. Keeping it in the workspace means every repo-wide change still has to
check, format, and test it. Its README also keeps a deliberate exception to the
family Pi-version rule (`docs/readme.md`, `extension-packaging`), which ends
only when the package goes.

## What Changes

- Delete `packages/pi-theme-sync`, including its own OpenSpec root. The
  published versions, release tags, and Git history keep everything it held.
- Drop its two entries from the root `.pi/settings.json` and refresh
  `pnpm-lock.yaml`.
- Remove Theme Sync from every place that lists the family's extensions: the
  root `README.md` package table and install example, `AGENTS.md`, the
  `extension-packaging` spec's Purpose, and the name lists and examples in
  `docs/code.md`, `docs/text.md`, `docs/readme.md`, `docs/config.md`,
  `docs/tui.md`, and `docs/releasing.md`. The family goes from five extensions
  to four.
- No changeset. No remaining package changes version, and the npm package keeps
  its 0.7.0 deprecation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No requirement changes. Only the `extension-packaging` Purpose names the
package, and a Purpose is edited in the main spec directly, so the change sets
`skip_specs: true`.

## Impact

- Workspace: one package fewer in `packages/*`, `pnpm-lock.yaml`, and the root
  `mise run check`.
- Docs: the root README, `AGENTS.md`, and `docs/*.md`.
- Specs: the Purpose paragraph of `openspec/specs/extension-packaging/spec.md`.
- Unchanged: test fixtures and examples in `pi-extensions-core`,
  `pi-extensions-testing`, and `pi-extensions-release` that use `theme-sync` or
  `Theme Sync` as sample data, and the shown-text checker's product-name
  lists. See design.md.
- Users: none from this change. Installed copies keep working until users
  remove them, as the 0.7.0 notice asks.
