# Tasks

## 1. Remove the package

- [x] 1.1 Delete `packages/pi-theme-sync` and drop its two entries (`npm:@sherif-fanous/pi-theme-sync` and `../packages/pi-theme-sync`) from the root `.pi/settings.json`. Verify that `ls packages` no longer lists it and that `.pi/settings.json` is valid JSON without `theme-sync`.
- [x] 1.2 Delete `node_modules/.pnpm-workspace-state-v1.json`, run `pnpm install`, and verify that `pnpm-lock.yaml` has no `packages/pi-theme-sync` importer.

## 2. Update the family listings

- [x] 2.1 Remove the `pi-theme-sync` row from the root `README.md` package table, and change the install example to another extension, such as `pi-presets-plus`. Verify with `rg -n "theme-sync" README.md`, which should return nothing.
- [x] 2.2 Remove Theme Sync from the extension list in `AGENTS.md`, and from the `extension-packaging` spec's Purpose by editing `openspec/specs/extension-packaging/spec.md` directly: "The four extensions are …". Verify with `openspec validate --specs --strict` at the root.
- [x] 2.3 Update `docs/code.md`, `docs/text.md`, `docs/readme.md`, `docs/config.md`, `docs/tui.md`, and `docs/releasing.md` as design.md's "Swap examples instead of just deleting them" describes, and remove Theme Sync from the display-name and default-export lists. Run the `humanizer` skill over the changed prose. Verify with `rg -n -i "theme.?sync" docs AGENTS.md README.md openspec/specs`, which should return nothing.

## 3. Integration check

- [x] 3.1 Run `mise run check` at the repository root and verify that every remaining package passes.
- [x] 3.2 Run `rg -n -i --hidden "theme.?sync" -g '!.git' -g '!node_modules' -g '!pnpm-lock.yaml' -g '!**/openspec/changes/archive/**' -g '!**/CHANGELOG.md' .` and verify that every match is in the non-goal locations design.md lists (core, testing, and release sample data, and the shown-text checker).
