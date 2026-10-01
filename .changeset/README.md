# Changesets

Each file here records a change that the next release of one or more packages
ships. `mise run changeset` adds one, asking for the packages, bumps, and
summary; pass them as flags to skip the questions:
`mise run changeset --patch=<pkg> --minor=<pkg> --message=$'- Fixed: …'`. Use
`=`, because the message starts with `-`. `mise run version` turns them into
version bumps and Common Changelog sections, then deletes them. A bare
`changeset version` refuses to run, because it would write Changesets' own
changelog headings.

Write the summary as `- ` bullets, one per changelog entry. Start each bullet
with the group it belongs to: `Added:`, `Changed:`, `Removed:`, or `Fixed:`. The
prefix is dropped from the changelog. Write the rest in the family text
standard: an imperative sentence without a trailing full stop that names the
extension by its display name, with `**Breaking:**` first when the change breaks
something.

```markdown
---
"@sherif-fanous/pi-presets-plus": minor
---

- Changed: **Breaking:** Read the Project configuration only when Pi trusts the
  project
- Fixed: Fall back to the User value when a Project value is invalid
```

Breaking changes bump the minor version while a package is below 1.0.0.

`mise run check` validates every pending changeset the way `mise run version`
will read it: the group prefixes, the package names, and no `major` bump below
1.0.0.
