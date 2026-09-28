# Releasing

Changesets versions and publishes the packages, each with its own version.
Pending changes live in `.changeset/*.md` until a release, never in an
`## [Unreleased]` changelog section.

1. Add a changeset with every user-visible change: `mise run changeset`. Pick
   the packages and the bump: `patch` for fixes, `minor` for features and, while
   a package is below 1.0.0, for breaking changes. Write the summary as `- `
   bullets that start with `Added:`, `Changed:`, `Removed:`, or `Fixed:`, in the
   text standard ([text.md](text.md)), with `**Breaking:**` first on a breaking
   entry. `.changeset/README.md` has an example. Changes users can't see (tests,
   tooling, refactors) need none. `mise run check` rejects a changeset that
   `mise run version` couldn't release. Agents pass everything as flags so
   nothing prompts, with `=` because the message starts with `-`:
   `mise run changeset --patch=@sherif-fanous/pi-rtk --minor=@sherif-fanous/pi-theme-sync --message=$'- Fixed: …\n- Added: …'`.
2. `mise run version` bumps the versions, releases every extension that depends
   on core when core changes, writes a `## [x.y.z] - YYYY-MM-DD` section and its
   tag link into each `CHANGELOG.md`, and deletes the changesets. Don't run
   `changeset version`: it refuses to run, because it would write Changesets'
   own headings.
3. Review the versions and changelogs, then commit them.
4. `mise run publish` runs the root check, then publishes every package whose
   version isn't on npm yet, core first, and tags each release
   `@sherif-fanous/<package>@<version>`. It reads `NPM_ACCESS_TOKEN` from the
   root `.env`.
5. Push the commit and the tags: `git push --follow-tags`.
