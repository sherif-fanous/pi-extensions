# Tasks

## 1. Deprecation notice

- [x] 1.1 In `src/runtime.ts`, add a deprecation notice builder that uses the
      effective `runtimeConfig.themes.light` and `.dark`, and push its text onto
      `warnings` right after `loadStartupConfig` and before `probeDetectors`.
      Verify with a new test in `tests/runtime-session-config.test.ts`: with a
      User file mapping `catppuccin-latte` and `catppuccin-macchiato`, the setup
      notification contains the exact notice with
      `"theme": "catppuccin-latte/catppuccin-macchiato"`.
- [x] 1.2 Add tests for the other deprecation scenarios in the extension delta:
      default mapping without files (`"light/dark"`), the notice with
      `syncEnabled: false` (no theme applied), and sync still applying the
      mapped theme. Also cover the status ordering scenario: an invalid value,
      then the notice, then a detector warning from a fake detector. Verify with
      `mise run test` in `packages/pi-theme-sync`.
- [x] 1.3 Update existing tests that assume setup can finish without notifying,
      such as the migration test's `again.notify` not-called check and exact
      `notify` call lists, so that they expect the one deprecation warning.
      Verify that `mise run test` passes with no skipped tests.

## 2. Deferral to Pi's theme pair

- [x] 2.1 Add `readThemeSetting?: () => string | undefined` to
      `ThemeSyncRuntimeOptions` (default `() => undefined`) and a local
      `isThemePair` that matches Pi's rule: exactly one `/` and non-empty
      trimmed sides. Verify with tests for `a/b`, `a / b`, `a/b/c`, `light/`,
      `/dark`, `dark`, and `undefined`.
- [x] 2.2 In `startAppearanceMonitoring`, when the setting is a pair, record the
      deferral notice instead of the deprecation notice. Set a `deferred` flag,
      `detectionStrategy = "Inactive"`, `currentAppearance = "unknown"`, and
      `markEvent("Deferred to Pi's theme setting")`, then return before
      `probeDetectors`. Make `getStatus` report `syncEnabled: false` while
      deferred. Verify with runtime tests where fake detectors record no calls
      and `ctx.ui.setTheme` is never called, both with `syncEnabled` `true` and
      with `false`, and where the status report shows `Sync: off`,
      `Detection strategy: Inactive`, `Desired theme: none`, the last event, and
      the notice under `Warnings:`.
- [x] 2.3 In `src/index.ts`, build `readThemeSetting` from `pi` by
      feature-detecting `getSettings`: a structural cast, `.call(pi)`, a string
      check on `theme`, and a `try`/`catch` that returns `undefined`. Pass it to
      `createThemeSyncRuntime`. Verify with a test in `tests/index.test.ts`: a
      fake `pi` with `getSettings` returning `{ theme: "latte/mocha" }` defers
      on `session_start`, one whose `getSettings` throws does not defer, and one
      without `getSettings` does not defer.
- [x] 2.4 Extend `tests/shown-text.test.ts` so that both notice texts are
      recorded (a sync session and a deferring session), and verify that
      `findShownTextViolations` still returns `[]`.

## 3. README and changeset

- [x] 3.1 Update `README.md` as design.md describes. Put the deprecation block
      with the migration steps right after the lead sentence, without a heading,
      and remove `### Pi's built-in auto theme`. Fix `auto:light,dark` in
      `## How it works` and say that current Pi has no color-scheme query. Run
      the `humanizer` skill over the new prose. Verify with `mise run check`
      (format and lint), and verify that `rg -n "auto:" README.md` returns
      nothing.
- [x] 3.2 Add the changeset:
      `mise run changeset --minor=@sherif-fanous/pi-theme-sync --message=$'- Added: Theme Sync shows a notice at startup that it is deprecated, with the Pi `theme`setting that replaces your light and dark themes.\n- Changed: Theme Sync stops changing themes when Pi'"'"'s`theme` setting already switches between a light and a dark theme.'`.
      Verify that the file exists in `.changeset/` and that `mise run check`
      accepts it.

## 4. Integration check

- [x] 4.1 Run `mise run check` at the repository root and
      `openspec validate deprecate-theme-sync --strict` in
      `packages/pi-theme-sync`. Verify that both pass.
- [x] 4.2 Manual check with Pi 0.99.2 from `packages/pi-theme-sync`. Start `pi`
      with a single `theme` setting and confirm the deprecation warning and
      theme switching. Then set
      `"theme": "catppuccin-latte/catppuccin-macchiato"`, start `pi` again, and
      confirm the deferral warning, that `/theme-sync status` shows `Sync: off`,
      and that the pair is still in `settings.json` after you switch the OS
      appearance.

## 5. After publishing (owner)

- [x] 5.1 After `mise run publish` releases the new version, run
      `npm deprecate @sherif-fanous/pi-theme-sync "Pi now switches themes itself. Set theme to <light>/<dark> in Pi's settings and remove this package."`,
      then verify that `npm view @sherif-fanous/pi-theme-sync deprecated` prints
      the message.
- [x] 5.2 Open the follow-up repo-wide change in the root `openspec/` that
      removes `packages/pi-theme-sync` from the workspace, the root
      `.pi/settings.json`, and the root README and AGENTS.md. That removal also
      ends the README's deliberate exception to the `docs/readme.md` and
      `extension-packaging` Pi-version rule, so neither needs an exception.
      Verify that `openspec list` at the root shows it.
