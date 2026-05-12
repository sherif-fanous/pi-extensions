# Agents

## mise

This project uses [mise](https://mise.jdx.dev/) as the task runner. mise
automatically provisions the correct Node.js version (declared in `mise.toml`
under `[tools]`) before every command, so the runtime is always consistent.

Run any task with:

```shell
mise run <task>
```

### Available tasks

| Task                         | Description                                                                                                                        |
| :--------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| `mise run check`             | Run format-check, type-check, and lint (the full pre-commit gate)                                                                  |
| `mise run fallow`            | Run both `fallow-dead-code` and `fallow-dupes` as an advisory audit                                                                |
| `mise run fallow-dead-code`  | Report unused exports / dead code via `fallow dead-code`                                                                           |
| `mise run fallow-dupes`      | Report duplicated code via `fallow dupes`                                                                                          |
| `mise run format`            | Auto-format source files with Prettier                                                                                             |
| `mise run format-check`      | Check formatting without writing changes                                                                                           |
| `mise run install-deps`      | Install npm dependencies                                                                                                           |
| `mise run install-dev-deps`  | Install npm dev dependencies (`pnpm add --save-dev`)                                                                               |
| `mise run lint`              | Lint source files with Biome and ESLint                                                                                            |
| `mise run lint-fix`          | Auto-fix lint violations with Biome and ESLint                                                                                     |
| `mise run login`             | Log in to npm via `pnpm login` (interactive; only needed if you don't use a token in `.env`)                                       |
| `mise run pack-check`        | Run the full `check` gate, then `pnpm pack --dry-run` to verify the package builds and packs cleanly                               |
| `mise run publish`           | Run `pack-check`, then publish to npm with `pnpm publish --access public` (auth via `NPM_ACCESS_TOKEN` from `.env` and `./.npmrc`) |
| `mise run sort-package-json` | Sort `package.json` keys                                                                                                           |
| `mise run type-check`        | Run TypeScript type checking                                                                                                       |
| `mise run uninstall-deps`    | Uninstall npm dependencies                                                                                                         |
| `mise run update-deps`       | Update npm dependencies                                                                                                            |

## Code conventions

The `fallow-*` tasks (and their `fallow` aggregator) are **advisory
audits, not gates**. Run them periodically — e.g. before a release or
when cleaning up a module — and use human judgement on the output.
They are intentionally excluded from `check` because their reports
routinely contain legitimate false positives (public API exports,
intentionally-parallel code) that would make the pre-commit gate
noisy and encourage reflexive "fix it to shut the tool up" refactors.

Prettier, Biome, ESLint, and `tsc` enforce formatting, import order,
naming, file-section ordering, kebab-case filenames, function-declaration
style, and bans on `any` / `!` / `console.*` / one-letter identifiers.
Run `mise run check` to surface violations across all four tools — most
are auto-fixable via `mise run format` or `mise run lint-fix`.

The conventions below are the ones the linter cannot enforce. They are
project-wide unless noted.

### User-facing strings

- Labels in dialog rows, status text, and the menu overlays use Title
  Case, e.g. `Theme Sync`, `Theme Sync Config`, `Theme Sync Status`,
  `Sync Status`, `Polling Interval`, `Write Config To`, `Light Mode
  Theme`, `Dark Mode Theme`, `Appearance:`, `Applied Theme:`, `Sync
  Active:`. Use trailing colons when rendered as key/value status
  rows; omit them on standalone titles.
- Prose in warnings, notifications, and dialog bodies uses
  sentence-case English and complete sentences with terminal periods,
  e.g. `Sync is active but appearance is unknown — no theme applied`,
  `Enter milliseconds (>= 1000)`.
- Pi command names stay literal and unchanged in spelling/case:
  `/theme-sync`, `/reload`. The slash is part of the name in prose.
- Use `Pi` as a capitalized product noun in prose (`Pi's theme`),
  and use lowercase only for the `pi` CLI binary or package names
  such as `pi-coding-agent`, `pi-tui`.
- Footer hint strings follow the `↑↓ <move-verb> • Enter
  <action-verb> • Esc back • Ctrl+C quit` shape. Examples in use:
  `↑↓ navigate • Enter open • Ctrl+C / Esc quit`, `↑↓ move • Enter
  edit • Ctrl+S save • Ctrl+R reload • Esc back • Ctrl+C quit`,
  `Type digits • Enter confirm • Backspace delete • Esc back •
  Ctrl+C quit`. The action verb is mode-specific; the navigation /
  back / quit suffix stays consistent.
- Detector-strategy labels live in one place
  (`DETECTOR_LABELS` in `src/runtime.ts`) and use the human-readable
  form (`"DEC mode 2031"`, `"DSR 996/997"`, `"OSC 11"`, `"System
  Appearance"`). These show up verbatim in the Status overlay's
  `Detection Strategy:` and `Available Detectors:` rows; do not
  duplicate the strings at call sites.

### Architecture

- Return a discriminated `{ config?, warning? }`-style result for
  expected failures (validation, missing files, malformed JSON). The
  `readJsonIfExists` helper in `src/config.ts` is the canonical
  shape. Throw only for I/O failures the caller cannot meaningfully
  recover from (file exists but isn't readable, etc.).
- Pure validation layers return validated values **and** push to a
  shared `warnings: string[]` rather than throwing on bad config.
  `validateIsSyncActive`, `validatePollingIntervalMs`, and
  `validateTheme` in `src/config.ts` are the canonical pattern. The
  orchestrator (`loadConfig`) collects all warnings and exposes them
  via `RuntimeStatus.warnings`; the `/theme-sync` Status overlay
  surfaces them to the user. Only the UI / status-surface boundary
  decides whether to render them.
- Storage operations re-read from disk on every call. `loadConfig`
  reads both the global and project JSON files via
  `readJsonIfExists` on every invocation — no module-level cache of
  on-disk state. This makes `ctx.reload()` work for free and avoids a
  class of staleness bugs.
- `writeJson` in `src/config.ts` performs `mkdir -p` →
  `fs.writeFile`. This is **not** an atomic write (no tmp-file +
  rename). The current single-writer single-file pattern makes this
  acceptable in practice, but the path to harden it is to introduce
  an `atomicWrite(target, contents)` helper (`mkdir -p` → tmp file
  → `fsync` → `rename`) when concurrent writes become possible.
  Until then, do not extend `writeJson` to handle additional file
  formats without revisiting the durability story.
- One source of truth for parallel structures: when the runtime loop
  and the probe function need to agree on a detector list, define
  one `as const`-typed registry and consume it from both sites. See
  `POLLING_DETECTORS` and `SUBSCRIPTION_DETECTORS` in
  `src/detectors/index.ts` — both are consumed by their respective
  `probeAvailable*Detectors` helpers and by `detectAppearance`'s
  switch arms. New detectors added to the registry should not
  require code changes anywhere except `detectAppearance` (the
  detector-implementation switch) and the per-detector module.

### API shape

- Functions consuming `ExtensionContext` declare the minimum surface
  via `Pick<ExtensionContext, …>` where doing so tightens the contract
  meaningfully. The current code passes the full `ExtensionContext`
  to most helpers; if a helper truly only needs `ctx.cwd` or
  `ctx.ui.theme`, restate the parameter type as
  `Pick<ExtensionContext, "cwd">` etc. so test seams (when added) can
  pass tiny fakes.
- Test seams are exposed as optional last parameters with the real
  implementation as the default. `queryWithTerminalListener`'s
  `timeoutMs = DEFAULT_TERMINAL_QUERY_TIMEOUT_MS` is the canonical
  shape — the constant is the local default and callers override
  only when a different bound makes sense. No DI container.
- Long-running state lives in a closure factory, not a class.
  `createThemeSyncRuntime()` in `src/runtime.ts` is the canonical
  pattern: it returns an object with `setupAppearanceMonitoring`,
  `cleanup`, and `getStatus`; internal mutable state lives in `let`
  bindings inside the factory. The `ThemeSyncRuntime` type is the
  caller's only surface. Do not promote internal `let` bindings to
  exported state — if the runtime needs to expose new information,
  add a method or extend `RuntimeStatus`.
- The `/theme-sync` command is interactive (opens an overlay via
  `openThemeSyncOverlay`), not text-output. Mode state is held in a
  discriminated `ThemeSyncOverlayMode` union and rendered via
  `rebuild()`, which delegates the shared layout to
  `buildListOverlay` for the five list-based modes (`menu`, `config`,
  `themeSelect`, `syncSelect`, `writeTarget`). The two non-list modes
  (`pollIntervalEdit`, `status`) intentionally render inline because
  their body content does not fit the list-overlay shape.

### Detection layering

Appearance detection has three concentric layers; understanding the
boundaries between them is the most useful background for any
detection-related change.

- **The terminal-query primitive** is `queryWithTerminalListener<T>`
  in `src/detectors/terminal/query.ts`. It writes a query sequence
  to stdout, subscribes a `TerminalInputHandler` via
  `ctx.ui.onTerminalInput`, races the reply against a timeout, and
  always cleans up (`unsubscribe` + `clearTimeout`) before resolving.
  All per-protocol detectors call this helper rather than reading
  from stdin directly; do not bypass it.
- **Per-protocol detectors** live under `src/detectors/terminal/` and
  follow a two-function shape: an orchestrator
  (`detectAppearanceViaDsr996(ctx)` etc.) that wires the query
  sequence to the helper, and a pure parser
  (`parseDsr997Reply(data: string): Appearance`) that classifies the
  reply text. Keep the parser separate from the orchestrator so it
  can be unit-tested without a terminal harness.
- **Strategy classes:**
  - _Polling_ detectors (`dsr-996`, `osc-11`, `system`) reply
    on-demand; the runtime calls them in a `setInterval` loop. They
    are listed in `POLLING_DETECTORS` and dispatched through
    `detectAppearance(ctx, kind)`.
  - _Subscription_ detectors (`dec-mode-2031`) emit unsolicited
    notifications and return a `*Subscription` object whose
    `removePiTerminalInputListener` / `disableTerminalNotifications`
    methods MUST be called on cleanup. They are listed in
    `SUBSCRIPTION_DETECTORS`.
- **Runtime preference: subscription over polling.** When both
  classes have available detectors, the runtime picks the first
  available subscription detector and runs only a low-frequency
  drift-correction `setInterval` alongside it (in case the user
  changes Pi's theme manually after we set it). Polling is the
  fallback when no subscription detector is supported.

### Documentation

- Every source file opens with a module-level JSDoc block stating:
  (a) the file's role in one line, (b) what it owns vs. what it does
  NOT own. Keep it high-level and change-agnostic — do NOT mention
  OpenSpec change names, future-change extension points, or
  implementation details (those belong on the relevant function/type,
  in the OpenSpec proposal, or in inline comments).
- Comments explain _why_, not _what_. Common patterns: rationale on
  non-obvious orderings (subscription-before-polling in the runtime
  setup, the drift-correction interval rationale), invariant
  statements on parsed-reply regex patterns, and notes on terminal
  escape sequences that look line-noisy but are intentional.
- Lifecycle handlers (`session_start`, `session_shutdown`, the
  `/theme-sync` command handler) should wrap their bodies in
  defense-in-depth `try/catch` with a comment explaining why the
  guard exists — terminal queries can hang, detection can throw on
  partial reads, and a session-start failure here MUST NOT block
  Pi's other extensions from loading.

## Commit messages

Commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/), i.e. `<type>(<optional-scope>): <subject>` on the first line, where `<type>` is one of:

| Type       | Use for                                                                          |
| :--------- | :------------------------------------------------------------------------------- |
| `build`    | Build system, package manifest, or dependency changes                            |
| `chore`    | Maintenance tasks that don't fit elsewhere (e.g. tooling config tweaks)          |
| `ci`       | CI configuration changes                                                         |
| `docs`     | Documentation-only changes (README, AGENTS.md, openspec proposals/designs, etc.) |
| `feat`     | A new user-visible feature                                                       |
| `fix`      | A bug fix                                                                        |
| `perf`     | Performance improvements                                                         |
| `refactor` | Code restructuring with no behavior change                                       |
| `revert`   | Reverting a previous commit                                                      |
| `style`    | Formatting / whitespace / lint-only fixes that don't change behavior             |
| `test`     | Adding or updating tests                                                         |

Guidelines:

- Subject is in the imperative mood ("add detector", not "added detector" or "adds detector"), lowercase, no trailing period, ideally ≤ 72 characters.
- Use a scope when it sharpens meaning, e.g. `feat(theme-sync-overlay): ...` or `fix(detectors): ...`. Skip the scope when the change is broad.
- Append `!` after the type/scope (e.g. `feat(config)!: ...`) for a breaking change, and explain it in the body or a `BREAKING CHANGE:` footer.
- Optional body (after a blank line) explains _why_; reference the OpenSpec change name when relevant (e.g. `Part of openspec change: add-osc-11-detector`).

Examples:

```text
chore: bump prettier to 3.8.3
feat(theme-sync-overlay): extract shared list-overlay builder
fix(config): replace String(value) with JSON.stringify in isSyncActive warning
chore: migrate pi dependencies to @earendil-works npm scope
chore(release): v0.3.0
```

### Body conventions for substantial commits

Commits that touch more than ~3 files SHOULD include a structured body. Use this skeleton:

1. **One-paragraph "why"** — what this commit makes possible / what part of the project plan it advances. Reference the OpenSpec change name when relevant.
2. **`What's in:` bullet list** — one bullet per _role_ (not one per file). Order bullets by purpose-cluster: manifest → build/lint configs → source → docs/legal → repo meta → openspec. Within the repo-meta cluster, list files in dependency order (a file gets introduced before any file that references it; e.g. `mise.toml` before `AGENTS.md`).
3. **`Verified:` bullet list** — one bullet per check that was actually run (lint, type-check, format-check, install round-trip, pack contents, etc.).
4. **Footer line** — `Closes openspec change: <name>.` for the commit that finishes a change, or `Part of openspec change: <name>.` for incremental commits.

Keep bullets ≤ 2 lines each; wrap the body at 72 columns.
