## 1. Hanging-indent component

- [x] 1.1 Add a `HangingText` component to `src/command.ts` implementing `pi-tui`'s `Component` interface, constructed from an array of `{ prefix, body }` lines plus `paddingX` and an optional per-line style function.
- [x] 1.2 Implement `render(width)`: compute `contentWidth = Math.max(1, width - paddingX * 2)`, and for each line wrap `body` with `wrapTextWithAnsi` at `Math.max(1, contentWidth - visibleWidth(prefix))`.
- [x] 1.3 Emit the first wrapped segment after `prefix` and every continuation segment after `" ".repeat(visibleWidth(prefix))`, then apply the style function per line and prepend the `paddingX` left margin.
- [x] 1.4 Implement `invalidate()` as a no-op or cache reset consistent with the other components used in `rebuild()`.
- [x] 1.5 Add a doc comment stating what the component owns (wrapping + hanging indent for prefixed lines) and what it does not (padding semantics beyond `paddingX`, background fills, caching).

## 2. Status overlay call sites

- [x] 2.1 Replace the warning block's `Text` with `HangingText`, passing `{ prefix: "  - ", body: warning }` per warning and keeping the literal `Warnings:` header line with an empty prefix.
- [x] 2.2 Style warning lines with `theme.fg("warning", …)` per rendered line instead of colorizing the joined string up front.
- [x] 2.3 Replace the `statusLines` `Text` with `HangingText`, splitting each row into its padded label prefix and its value body so the existing column alignment is preserved exactly.
- [x] 2.4 Confirm the rendered label column width is unchanged from the current hardcoded padding (no visual shift for short values).

## 3. Shared list-overlay message line

- [x] 3.1 Replace the `message` `Text` in `buildListOverlay` with `HangingText` using an empty prefix, so wrapped message lines align under the message start.
- [x] 3.2 Apply `theme.fg(message.severity ?? "warning", …)` per rendered line.
- [x] 3.3 Replace the polling-interval editor's validation-error `Text` with `HangingText` and apply warning styling per rendered line.

## 4. Verification

- [x] 4.1 Run `mise run check` (format-check, type-check, lint) and fix any violations.
- [x] 4.2 Use a runtime scaffold with a long warning, open `/theme-sync` → `Status`, and confirm continuation lines align under the `- ` bullet.
- [x] 4.3 Repeat at a terminal narrower than the 78-column overlay width and confirm wrapping adapts with no truncation or lost text.
- [x] 4.4 Force a long `Available Detectors:` value and confirm continuation lines align under the value column with the label column blank.
- [x] 4.5 Trigger a config validation error in the config overlay and confirm the inline message wraps with a hanging indent and keeps its severity styling.
- [x] 4.6 Confirm short warnings, short status values, and short messages render unchanged (single line, no added indent).

## 5. Wrap-up

- [x] 5.1 Create the branch `fix/status-warning-wrap-indent` if not already on it.
- [x] 5.2 Commit as `fix(theme-sync-overlay): hang-indent wrapped overlay text` with a body referencing this OpenSpec change.
- [x] 5.3 Run `openspec validate fix-status-overlay-wrap-indent` and confirm it passes.
