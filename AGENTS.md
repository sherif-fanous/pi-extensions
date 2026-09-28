# Agents

A pnpm workspace of Pi extensions (RTK, Theme Sync, Presets Plus, Notification
Center, Session Slice), a shared runtime library (`pi-extensions-core`), and
private test and release tooling.

- Tasks run through mise, never `npm` or bare `pnpm run`. `mise run check` at
  the root checks everything; inside `packages/<p>` it checks one package
  (format, types, lint, tests). `mise run format` and `mise run lint-fix` fix
  most failures.
- After changing any `package.json`, delete
  `node_modules/.pnpm-workspace-state-v1.json` and run `pnpm install`, or pnpm
  may leave `pnpm-lock.yaml` stale.
- A change users can see needs a changeset; see
  [docs/releasing.md](docs/releasing.md).
- Before changing a package, read its `AGENTS.md`, if it has one.

Read the guide for the area you're changing:

- [docs/code.md](docs/code.md): core helpers to reach for, errors, warnings,
  state, tests, and comments.
- [docs/text.md](docs/text.md): everything an extension shows, from names and
  descriptions to messages, reports, and severities.
- [docs/tui.md](docs/tui.md): overlays, dialogs, pickers, key hints, and lists.
- [docs/config.md](docs/config.md): `config.json` files, trust, versions,
  migration, and status blocks.
- [docs/readme.md](docs/readme.md): READMEs, `package.json` descriptions, and
  changelogs.
- [docs/tooling.md](docs/tooling.md): shared configs, dependencies, and
  OpenSpec.
- [docs/releasing.md](docs/releasing.md): changesets, versions, and publishing.

Starting `pi` at the root loads every local extension; starting it in
`packages/<p>` loads only that one.
