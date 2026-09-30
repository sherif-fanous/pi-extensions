# extension-packaging Specification

## Purpose

Define the shape every package in the pi-extensions workspace shares: the npm
manifest, dependencies, published files, supported Pi version, README,
changelog, license, and the tooling each package runs. The five extensions are
`@sherif-fanous/pi-rtk`, `pi-theme-sync`, `pi-presets-plus`,
`pi-notification-center`, and `pi-session-slice`; the published library is
`@sherif-fanous/pi-extensions-core`. Each extension's own specs cover its
behavior.

## Requirements

### Requirement: Extension manifest identifies a Pi package

Every extension's `package.json` SHALL declare `name` as
`@sherif-fanous/pi-<slug>`, `license: "MIT"`, `type: "module"`, and
`author: "Sherif Fanous"`. Its `keywords` SHALL contain `pi`, `pi-coding-agent`,
and `pi-package`, followed by keywords for the extension's domain. Its `pi`
manifest SHALL have one key, `extensions`, listing the entry point
`./src/index.ts`. It SHALL NOT declare `scripts` or `engines`.

#### Scenario: Pi finds the entry point

- **WHEN** a user runs `pi install npm:@sherif-fanous/pi-<slug>` and starts Pi
- **THEN** Pi SHALL load the entry point listed under `pi.extensions`

#### Scenario: Package keywords

- **WHEN** an extension's `package.json` is inspected
- **THEN** its `keywords` SHALL start with `pi`, `pi-coding-agent`, and
  `pi-package`

### Requirement: Package descriptions share one shape

The `description` of every extension and of `pi-extensions-core` SHALL be one
clause of the form `Pi extension that <verb>s …`
(`Pi extension library that <verb>s …` for core), with no trailing full stop.
The first sentence of the package's README SHALL say the same thing.

#### Scenario: Description shape

- **WHEN** the `description` of `@sherif-fanous/pi-session-slice` is read
- **THEN** it SHALL read
  `Pi extension that starts a new session from a chosen range of the current one`

### Requirement: Pi packages are peer dependencies

Every published package SHALL list the `@earendil-works/pi-*` packages it
imports as `peerDependencies` at `"*"` and as `devDependencies` at `catalog:`,
so installing it never bundles a second copy of Pi. An extension SHALL depend on
`@sherif-fanous/pi-extensions-core` at `workspace:*`, which `pnpm publish`
replaces with the released version.

#### Scenario: Peer dependencies are not bundled

- **WHEN** a package is packed with `pnpm pack`
- **THEN** the tarball SHALL NOT contain a `node_modules` directory or any file
  of an `@earendil-works/pi-*` package

### Requirement: Published files are an allowlist

Every published package SHALL declare a `files` allowlist that packs only its
runtime sources, `README.md`, `LICENSE`, `CHANGELOG.md`, and `package.json`. The
tarball SHALL NOT contain tests, `tsconfig.json`, `mise.toml`, `openspec/`, or
other development files.

#### Scenario: Tarball contents

- **WHEN** `pnpm pack --dry-run` runs in a published package
- **THEN** the listed files SHALL be the runtime sources plus `README.md`,
  `LICENSE`, `CHANGELOG.md`, and `package.json`

### Requirement: Supported Pi version

Every published package SHALL be tested against the latest stable Pi release
only, and SHALL NOT state a minimum Pi version. Each README SHALL say so as the
first item of its `## Requirements` section.

#### Scenario: Requirements section

- **WHEN** a package's README is read
- **THEN** its `## Requirements` section SHALL first say that the package is
  tested only against the latest stable release of Pi

### Requirement: README follows the family template

Every extension's README SHALL have these sections in this order, skipping the
optional ones it does not need: the `# pi-<slug>` title and a lead sentence
linking Pi as `https://github.com/earendil-works/pi`, `## Why` (optional),
`## Requirements`, `## Install`, `## Usage` with a `### Commands` table and a
key table for each interactive surface, `## Configuration`, `## How it works`
(optional), `## Limitations` (optional), `## Troubleshooting` (optional), and
`## License`. Prose SHALL name the extension by its display name; the package
name appears only in the title, install commands, and paths. The library
packages SHALL use the same order with `## API` in place of `## Configuration`
and the sections after it.

#### Scenario: Install section

- **WHEN** an extension's `## Install` section is read
- **THEN** it SHALL show `pi install npm:@sherif-fanous/pi-<slug>`, then
  `Or try it without installing:` with `pi -e npm:@sherif-fanous/pi-<slug>`,
  then `To uninstall:` with `pi remove npm:@sherif-fanous/pi-<slug>`

### Requirement: Changelogs follow Common Changelog

Every published package's `CHANGELOG.md` SHALL start with the header
`# Changelog`, a blank line, and
`This changelog follows [Common Changelog](https://common-changelog.org/).`,
which is also the header `mise run version` writes for a missing changelog. It
SHALL have no `## Unreleased` section: pending changes live in `.changeset/`
until `mise run version` writes them as a `## [x.y.z] - YYYY-MM-DD` section.
Released sections SHALL stay as they were written.

#### Scenario: Changelog header

- **WHEN** a published package's `CHANGELOG.md` is read
- **THEN** its first three lines SHALL be `# Changelog`, a blank line, and the
  Common Changelog statement
- **AND** it SHALL NOT contain `## Unreleased` or `## [Unreleased]`

### Requirement: LICENSE is the MIT license

Every published package SHALL ship a `LICENSE` file with the MIT license text
and the line `Copyright (c) 2026 Sherif Fanous`.

#### Scenario: LICENSE is MIT

- **WHEN** a published package's `LICENSE` is read
- **THEN** it SHALL be the MIT license with the line
  `Copyright (c) 2026 Sherif Fanous`

### Requirement: Packages share the workspace tooling

Every package SHALL run its tasks through its `mise.toml`, which SHALL define
`check`, `format`, `format-check`, `lint`, `lint-fix`, `type-check`, `test`, and
`test-watch`. `check` SHALL run `format-check`, `type-check`, `lint`, and
`test`. `format` and `format-check` SHALL cover every file in the package that
the root `.gitignore` and `.prettierignore` don't exclude. Every package's
`tsconfig.json` SHALL extend `../../tsconfig.base.json` and set only `include`
(plus `allowImportingTsExtensions` in `pi-extensions-release`). The shared
`eslint.config.mjs` SHALL extend `typescript-eslint`'s type-checked recommended
preset with `parserOptions.projectService: true`. Every package SHALL list the
tools its tasks run as `devDependencies` at `catalog:`.

#### Scenario: Check task

- **WHEN** `mise run check` runs in a package
- **THEN** it SHALL check formatting, types, and lint, and run the tests

#### Scenario: Lint catches floating promises

- **WHEN** code in any package leaves a promise-returning call unawaited
- **THEN** `mise run lint` SHALL fail
