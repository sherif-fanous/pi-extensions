# Tooling

- Tasks: mise is the single entry point for every task; `package.json` has no
  `scripts`. Read a package's `mise.toml` for its tasks. Releases run from the
  root (see [releasing.md](releasing.md)).
- Shared configs (TypeScript, Prettier, ESLint, Vitest, `.gitignore`) live at
  the root; a package keeps only what is its own, such as its `tsconfig.json`
  `include`. Don't add a per-package copy.
- Dependencies: Pi packages and dev tools are dev dependencies at `catalog:`, so
  an upgrade is one bump in `pnpm-workspace.yaml`. Published packages list the
  Pi packages as `peerDependencies` at `"*"`.
- Formatting covers every file Prettier can format, Markdown wrapped at 80
  columns; `mise run format` applies it. It skips what `.gitignore` and
  `.prettierignore` list: the lockfile and archived OpenSpec changes, which are
  left as written. The root `format` also sorts every `package.json` with
  `sort-package-json`, and the root check fails on an unsorted one.
- CI (`.github/workflows/check.yml`) runs `pnpm install --frozen-lockfile` and
  the root `mise run check` on every push to `main` and every pull request. The
  check's job summary has one table with every package's steps, and the log of
  each failed step.
- The root `check` is the file task `mise-tasks/check`; the other root tasks
  live in `mise.toml`.
- Renovate (`.github/renovate.json`) opens a pull request for each new
  dependency, Node, pnpm, or GitHub Action version, once the release is three
  days old. Actions are pinned by commit digest, with the version in a comment
  that Renovate keeps up to date.
- Node and pnpm are pinned to a major version in the root `mise.toml`; run
  `mise upgrade` for the newest release within it.
- The root `mise run check` checks every package at once. Each package prints
  one line when it finishes, and the output of any package that failed follows
  at the end, one package at a time.

## Lockfile

After changing any `package.json`, delete
`node_modules/.pnpm-workspace-state-v1.json` and run `pnpm install` before
committing. Otherwise pnpm may skip rewriting `pnpm-lock.yaml`.

## OpenSpec

Every package has its own `openspec/` root, and OpenSpec uses the nearest one,
so run it inside `packages/<p>` (for example
`openspec validate --specs --strict`). The root `openspec/` is for repo-wide
changes and specs, such as `extension-packaging`, the package shape every
extension shares. A new or changed core API gets a spec in
`packages/pi-extensions-core/openspec/specs/`. Every `openspec/config.yaml`, the
root's included, is the same file; change them together.

A spec starts with `# <capability> Specification`, where `<capability>` is its
folder name, then `## Purpose` and `## Requirements`. Requirement titles are
sentence case, and scenarios use bold `**GIVEN**`, `**WHEN**`, `**THEN**`, and
`**AND**`. Keep existing folder names. Packaging and tooling requirements belong
in `extension-packaging`, not in a package's specs.
