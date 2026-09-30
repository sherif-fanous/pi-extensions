# READMEs, descriptions, and changelogs

The standard for each package's README, `package.json` description, and
changelog. The repository-wide `extension-packaging` spec in `openspec/specs/`
holds the same rules.

- Pi link: `[Pi](https://github.com/earendil-works/pi)`, never
  `badlogic/pi-mono` or `badlogic/pi`.
- Naming: the README title is the package folder (`# pi-theme-sync`); prose
  names the extension by its display name ("Theme Sync switches …"), never
  `pi-<slug>`, "Pi Theme Sync", or "this extension". The package name appears
  only in the title, install commands, and paths.
- Description: the `package.json` `description` is one clause,
  `Pi extension that <verb>s …`, with no trailing full stop (core:
  `Pi extension library that <verb>s …`). The README's lead sentence says the
  same thing:
  `A [Pi](https://github.com/earendil-works/pi) extension that <verb>s ….`
- Pi version: packages are tested only against the latest stable Pi release, and
  READMEs say so as the first item in `## Requirements`:
  `Tested only against the latest stable release of [Pi](…)`. Don't state a
  minimum Pi version anywhere.
- README sections, in this order; skip the optional ones a package doesn't need:
  1. `# pi-<slug>`, the lead sentence, and at most a short paragraph more.
  2. `## Why` (optional): the problem the extension solves.
  3. `## Requirements`: the latest-stable-Pi line, then any other tools
     (`- rtk, installed and on your PATH`).
  4. `## Install`: the `pi install npm:@sherif-fanous/pi-<slug>` block, then
     `Or try it without installing:` with `pi -e npm:…`, then `To uninstall:`
     with `pi remove npm:…`.
  5. `## Usage`: the quickest way in (numbered steps when there are several),
     then `### Commands`, a `Command | What it does` table whose cells are
     sentences starting with a verb, plus any flags. Then one `### <Surface>`
     subsection per interactive surface, with its text and key table (see
     [tui.md](tui.md)).
  6. `## Configuration`: the layout in [config.md](config.md), or the one line
     an extension without a configuration file has.
  7. `## How it works` (optional): mechanism a user benefits from knowing.
  8. `## Limitations` (optional): what the extension deliberately doesn't do or
     can't tell apart.
  9. `## Troubleshooting` (optional): the diagnostic command and what to look
     for (`/rtk status`, `/theme-sync status`, `/presets status`,
     `/notifications status`).
  10. `## License`: `[MIT](LICENSE)`.
- Library READMEs (`pi-extensions-core`, `pi-extensions-testing`) keep the same
  order with a library's content: title and lead, `## Requirements`,
  `## Install` (the `pnpm add` command or the `workspace:*` dependency),
  `## Usage` (an import example), `## API` (one entry per export, grouped), and
  `## License`.
- Headings are sentence case (`## How it works`, `### The picker`).
- Changelogs: every `CHANGELOG.md` starts with the header block
  `mise run version` writes for a new one:

  ```markdown
  # Changelog

  This changelog follows [Common Changelog](https://common-changelog.org/).
  ```

  Versions follow as `## [x.y.z] - YYYY-MM-DD` sections, newest first, with
  their link references at the end. Only `mise run version` adds a section, from
  the changesets (see [releasing.md](releasing.md)); there is no
  `## [Unreleased]` section. Released sections keep their links to the old
  single-extension repositories; reword an entry only to fit Common Changelog.

- `CONTRIBUTING.md`: every extension has the same text (setup, tasks, planning,
  and the checklist before a pull request); add a package's own manual check to
  the checklist, as Notification Center does.
