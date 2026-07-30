## Why

Long lines in the `/theme-sync` overlays wrap to column 0, so wrapped
continuation text stops reading as part of the construct it belongs to: a
bulleted warning loses its `  - ` alignment, and a long `Available Detectors:`
row destroys the key/value column alignment of the whole status block. The
v0.4.0 color-scheme compatibility warning is the first message long enough to
hit this at the overlay's fixed 78-column width, and it is the extension's only
compatibility signal, so shortening the text is not an acceptable fix.

## What Changes

- Introduce a width-aware hanging-indent renderer for overlay text so wrapped
  continuation lines align under the first line's text column instead of
  column 0.
- Apply it to the Status overlay warning block, so continuation lines align
  under the `- ` bullet.
- Apply it to the Status overlay's label/value rows, so a long value (notably
  `Available Detectors:`) wraps under its value column and keeps the block's
  column alignment.
- Apply it to the shared list-overlay inline message line and the polling-
  interval editor's validation error, so config messages wrap consistently.
- No warning or message wording changes, and no change to which warnings are
  produced.

## Capabilities

### New Capabilities

<!-- None: this change modifies rendering behavior of existing overlays. -->

### Modified Capabilities

- `theme-sync-status`: adds a requirement that overlay text which exceeds the
  render width wraps with a hanging indent — warning bullets and label/value
  rows keep their alignment on continuation lines.
- `theme-sync-config-ui`: adds a requirement that the config overlay's inline
  message line wraps with a hanging indent rather than to column 0.

## Impact

- `src/command.ts` — the Status branch of `rebuild()`, the shared
  `buildListOverlay` message line, and a new small `Component` implementation
  (or a new module it is extracted into).
- Uses `wrapTextWithAnsi` already exported from `@earendil-works/pi-tui`; no new
  dependencies.
- No changes to `src/config.ts`, `src/runtime.ts`, or the detector modules; the
  warning strings themselves are untouched.
- Cosmetic only: no config format, CLI surface, or persisted-state changes.
