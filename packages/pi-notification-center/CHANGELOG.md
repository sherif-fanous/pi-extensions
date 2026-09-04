# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## 0.2.0 - 2026-09-04

### Changed

- Size the history browser to the notification you are reading. A message that fits the terminal is shown in full instead of being squeezed into a fixed height.
- Show where you are in a long message. The detail pane names the visible range, and arrows mark the edges that have more text above or below.
- Fit toast cards to the message. A short notification no longer draws a wide, mostly empty card, and the width setting is now the widest a card may grow rather than a fixed size.
- Widen the default toast from 50 to 64 columns so fewer notifications are cut short.
- Show toasts on terminals narrower than your configured width. Cards shrink to fit instead of disappearing.

## 0.1.0 - 2026-09-03

### Added

- Show notifications from other extensions as toasts in the top-right corner instead of rows in the chat transcript. Toasts stack, expire on their own, and never take keyboard focus.
- Add `/notifications`, a two-pane browser for everything captured in the current session. The list shows notifications newest first with color-coded severities, and the detail pane shows the selected message in full.
- Add optional configuration at `~/.pi/agent/notification-center/config.json` for how many toasts show at once and for each card's lifetime, height, and width.
