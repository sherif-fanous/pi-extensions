# Design

## Context

See proposal.md for why. Apart from the package itself, `theme-sync` and
`Theme Sync` appear in three kinds of places:

1. Places that say Theme Sync belongs to the family: the root `README.md`,
   `AGENTS.md`, the `extension-packaging` Purpose, `.pi/settings.json`, and the
   name lists in `docs/code.md` (default export names, display names) and
   `docs/text.md` (display names).
2. Docs examples that use Theme Sync to illustrate a rule: `docs/readme.md`
   (README title, naming, `/theme-sync status`), `docs/config.md` (migration
   message and status paths), `docs/tui.md` (the form list), `docs/releasing.md`
   (the changeset command), and `docs/code.md` (the pointer to theme-sync's
   `runtime.ts` and the "Theme Sync settings registry" rejected idea).
3. Code, tests, and the core README that use `theme-sync` / `Theme Sync` as
   sample data: core's config and report tests and README examples, the testing
   package's shown-text tests and checker name lists, and the release package's
   changelog and version tests.

## Goals / Non-Goals

**Goals:**

- Nothing in the repo describes Theme Sync as a current package, and no example
  points readers at code that no longer exists.
- `mise run check` passes with the package gone.

**Non-Goals:**

- Rewriting sample data in core, testing, and release (group 3). Those strings
  only feed functions that take any extension name; they are not claims of
  membership. Changing them would churn tests and the published core README for
  no behavior change.
- Removing `Theme Sync` and `pi-theme-sync` from the shown-text checker's
  product-name lists. They still catch the mistakes they were added for, and the
  testing package's own tests use the Theme Sync fixture.
- Removing the release tags or the npm package. npm keeps the deprecation.

## Decisions

### Delete the package's OpenSpec root with it

`packages/pi-theme-sync/openspec/` goes with the package. Its specs describe
code that no longer exists, and Git history keeps them. Moving them into the
root `openspec/` would leave specs with no implementation.

- **Alternative rejected:** archiving them under the root
  `openspec/changes/archive`. Archives hold changes, not capabilities, and
  nothing would read them.

### Swap examples instead of just deleting them

Where a doc uses Theme Sync to illustrate a rule (group 2), switch to another
extension so the rule keeps its example:

- `docs/code.md`: point the async-start example at Notification Center's
  `src/session.ts`, which handles a start that a later start or `dispose`
  overtakes. Drop the "Theme Sync settings registry" rejected idea.
- `docs/readme.md`: use `# pi-presets-plus` and "Presets Plus" for the naming
  examples. Drop `/theme-sync status` from the Troubleshooting list.
- `docs/config.md`: use Presets Plus in the migration message and the status
  paths (`presets-plus/config.json`).
- `docs/tui.md`: leave only the Presets Plus editor in the form example.
- `docs/releasing.md`: use `--minor=@sherif-fanous/pi-presets-plus` in the
  changeset command.

### Lockfile refresh

After deleting the package, delete `node_modules/.pnpm-workspace-state-v1.json`
and run `pnpm install`, as `AGENTS.md` requires after a `package.json` change.
That removes the `packages/pi-theme-sync` importer from `pnpm-lock.yaml`.

## Risks / Trade-offs

- [A link outside the repo, such as an npm page or the GitHub package page,
  points to `packages/pi-theme-sync`] → npm's README for 0.7.0 is the published
  copy, and the 0.7.0 tag keeps the folder browsable on GitHub.
- [A stale mention is missed] → The final task greps for `theme-sync` and
  `Theme Sync` outside the non-goal locations.

## Migration Plan

Commit as one change. Rollback is `git revert`.
