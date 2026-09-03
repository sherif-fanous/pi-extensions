# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## 0.1.0 - 2026-09-03

### Added

- Show notifications from other extensions as toasts in the top-right corner instead of rows in the chat transcript. Toasts stack, expire on their own, and never take keyboard focus.
- Add `/notifications`, a two-pane browser for everything captured in the current session. The list shows notifications newest first with color-coded severities, and the detail pane shows the selected message in full.
- Add optional configuration at `~/.pi/agent/notification-center/config.json` for how many toasts show at once and for each card's lifetime, height, and width.
