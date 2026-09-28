# Tooling

- Tasks: mise is the single entry point for every task; `package.json` has no
  `scripts`. Read a package's `mise.toml` for its tasks. Releases run from the
  root (see [releasing.md](releasing.md)).
- Shared configs (TypeScript, Prettier, Biome, ESLint, Vitest, `.gitignore`)
  live at the root; a package keeps only what is its own, such as its
  `tsconfig.json` `include`. Don't add a per-package copy.
- Dependencies: Pi packages and dev tools are dev dependencies at `catalog:`, so
  an upgrade is one bump in `pnpm-workspace.yaml`. Published packages list the
  Pi packages as `peerDependencies` at `"*"`.
- Formatting covers Markdown (READMEs, changelogs, `AGENTS.md`, `docs/`, specs),
  wrapped at 80 columns; `mise run format` applies it. Archived OpenSpec changes
  are left as written.

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
