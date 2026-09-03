## 1. Package foundation

- [x] 1.1 Create `.gitignore`, `AGENTS.md`, `CHANGELOG.md`, `eslint.config.mjs`, `LICENSE`, `mise.toml`, `pnpm-workspace.yaml`, `tsconfig.json`, and `vitest.config.ts`, and verify every requested top-level file exists.
- [x] 1.2 Create `package.json` for `@sherif-fanous/pi-notification-center` version `0.1.0` with `./src/index.ts` in `pi.extensions`, source-only package contents, relevant peer and development dependencies, and quality scripts; verify `pnpm install` succeeds and produces a lockfile.
- [x] 1.3 Add the initial `src/` and `tests/` module layout with module-level documentation conventions, and verify `pnpm type-check` can discover all intended source and test files.

## 2. Notification data and configuration

- [x] 2.1 Define the versioned notification entry, severity, and configuration types plus the documented defaults and ranges, and verify type-level and unit-test fixtures accept only the supported shapes.
- [x] 2.2 Implement global configuration loading from `<agent-dir>/notification-center/config.json`, including missing-file defaults, per-field validation, malformed JSON handling, and ignored unknown keys; verify unit tests cover defaults, valid overrides, mixed valid and invalid fields, and malformed input.
- [x] 2.3 Implement notification-entry creation and active-branch history extraction with strict version and payload validation, and verify unit tests cover ordering, invalid custom entries, complete multiline messages, and branch-local results.

## 3. Passive toast stack

- [x] 3.1 Implement the themed toast-stack component with downward arrival order, severity styling, line-break-preserving wrapping bounded by `toast.maxLines`, ANSI-aware width truncation, and terminal-size guards; verify rendering tests assert line widths and representative info, warning, error, multiline, over-tall, narrow, and empty states.
- [x] 3.2 Implement the manager for independent expiration timers, oldest-first visible eviction, stack compaction, render requests, and empty-stack surface removal; verify Vitest fake-timer tests cover arrival, independent expiry, `maxToastsVisible`, and disposal.
- [x] 3.3 Add the passive top-right `nonCapturing` overlay, created eagerly at session start so it never takes keyboard focus and never sits above another extension's overlay, degrading to history-only behavior when it is unavailable; verify fake-TUI tests confirm focus is unchanged, the surface starts hidden, and one overlay serves a burst.

## 4. Notification interception and lifecycle

- [x] 4.1 Implement TUI-only installation of a synchronous shared `ctx.ui.notify` wrapper that defaults missing severity to `info`, appends one hidden session entry, enqueues one toast, and suppresses the original transcript notification; verify tests cover all severities, default severity, and one persisted entry per call.
- [x] 4.2 Preserve existing notification behavior outside TUI mode and document the best-effort capture boundary in code; verify tests confirm RPC, JSON, and print contexts are not wrapped.
- [x] 4.3 Add identity-safe wrapper restoration, timer and overlay disposal, and stale-runtime guards for `session_shutdown` and reload; verify tests confirm cleanup cannot overwrite a later wrapper or mutate UI after disposal.
- [x] 4.4 Route a configuration warning through the initialized capture pipeline without recursion or duplicate history, and verify malformed configuration produces exactly one warning entry while valid or absent configuration produces none.

## 5. Notification history command

- [x] 5.1 Implement pure history formatting that produces colorized list rows and a detail body with locale date, time, severity, and complete wrapped messages; verify deterministic formatter tests using a fixed locale, timezone, terminal width, and a colorless theme.
- [x] 5.2 Implement the focused two-pane history component using injected Pi keybindings for selection, detail scrolling, and cancellation, and verify component tests cover pane layout, selection bounds, highlight placement, resize behavior, short terminals, empty history, long messages, and close handling.
- [x] 5.3 Register `/notifications` to read the current branch on every invocation and open the history browser only in interactive TUI mode, requesting an overlay wide enough for two panes; verify command tests cover populated history, empty history, branch changes between invocations, overlay sizing, and non-TUI fallback behavior.

## 5b. Configurable toast height

- [x] 5b.1 Add the `toast.maxLines` setting with its documented default and range, and verify configuration tests cover valid overrides, invalid values, and absence.
- [x] 5b.2 Render variable-height cards that preserve the message's own line breaks, bound each card at `toast.maxLines` with a truncation marker, and drop cards that do not fit the terminal while keeping the newest; verify rendering tests cover multiline, over-tall, and stack-taller-than-terminal cases.
- [x] 5b.3 Group per-card settings under a `toast` object with a top-level `maxToastsVisible`, reporting rejected values by dotted path; verify configuration tests cover nested overrides, a non-object `toast` section, and unknown keys at both levels.
- [x] 5b.4 Render the toast stack in a top-right overlay obtained through the focus-neutral `setWidget` factory and created eagerly at session start, toggling visibility rather than re-pushing, so a notification arriving while another extension's overlay is open cannot defocus it or consume its next close; verify regression tests assert no focus change, a hidden initial state, visibility toggling without leaving the stack, and a total height bounded to half the terminal.

## 6. Documentation and package checks

- [x] 6.1 Write `README.md` with installation, trial, removal, behavior, configuration example, `/notifications` usage, and interception limitations, in end-user language; verify every documented command, path, default, and range matches the spec and implementation.
- [x] 6.2 Complete `CHANGELOG.md`, `LICENSE`, and package metadata for the initial release, and verify the package name, version, repository links, author, license, and changelog version agree.
- [x] 6.3 Run `mise run check` and `mise run pack-check`, fix all failures, and verify the dry-run archive contains the extension source and user documentation but excludes tests, local configuration, OpenSpec planning files, and development caches.
- [x] 6.4 Add a development-only emitting extension under `examples/`, wire it into the quality gates but keep it out of the published package, then run a manual TUI check with `pi -e .` verifying captured notifications do not enter the transcript, stacked toasts do not steal input, expiration follows configuration, `/notifications` survives `/reload`, and no operating-system notification occurs.

## 7. Two-pane history browser

- [x] 7.1 Add a side-by-side frame primitive that composes two pre-styled panes inside one border with a straight divider, and verify width tests cover ANSI-styled content and uneven pane content.
- [x] 7.2 Colorize severities in both panes using theme colors, highlight the selected row with the theme selection background, and keep the highlight intact across truncation resets; verify formatter tests assert per-severity colors, highlight placement, and reset handling.
- [x] 7.3 Split the browser into a newest-first list pane and a detail pane for the selected entry, with selection keys moving the list and resetting detail scroll and page keys scrolling the detail; verify component tests cover selection, detail follow, bounds, scroll reset, and complete-message reachability.
- [x] 7.4 Request an overlay wide enough for two panes and bound content rows by terminal height so the footer is never clipped; verify tests cover overlay sizing, a narrow terminal, and a short terminal.
