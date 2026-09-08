## Why

The theme sync configuration surfaces use loose horizontal separators instead of a complete, responsive window, which makes nested views and errors harder to scan. The command also adds an unnecessary menu before configuration and presents status as interactive UI even though status is a read-only report.

## What Changes

- **BREAKING**: Make `/theme-sync` open the configuration overlay directly instead of showing a Config and Status menu.
- Add `/theme-sync status` as a read-only status command with themed transcript output in TUI mode and a notification fallback outside TUI mode.
- Render the configuration flow as a complete, width-safe window with plain borders, an accent title, section rules, and a contained footer.
- Apply the same frame and semantic color treatment to nested selection and error overlays.
- Keep field validation and recoverable save errors inline so the user's draft and editing context remain visible.
- Use Pi's input component for polling interval editing and preserve focus correctly.
- Size lists and overlay chrome for the available terminal dimensions so the footer and bottom border remain visible.
- Add pure rendering and command-routing tests for the revised surfaces.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `theme-sync-config-ui`: Open configuration directly and require the configuration flow, including inline and overlay errors, to use complete framing and consistent semantic styling.
- `theme-sync-status`: Replace the status overlay and top-level menu entry with `/theme-sync status` report delivery.

## Impact

The change affects `/theme-sync` argument routing, configuration overlay rendering, status delivery, error presentation, and related tests. It will introduce small repository-local UI framing helpers but no runtime dependency or shared cross-repository package.
