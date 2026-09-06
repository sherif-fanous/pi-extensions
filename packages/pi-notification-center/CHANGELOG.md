# Changelog

## [0.2.1] - 2026-09-06

### Fixed

- Draw a short toast in the corner again, instead of leaving it adrift of the right edge and blanking the transcript beside it ([#3](https://github.com/sherif-fanous/pi-notification-center/pull/3))
- Fit the notification history browser to the window, instead of drawing a frame wider than it with the right border cut off ([#3](https://github.com/sherif-fanous/pi-notification-center/pull/3))
- Report how many notifications the session holds when the window is too narrow to show the history browser ([#3](https://github.com/sherif-fanous/pi-notification-center/pull/3))
- Keep a toast against the right edge on a narrow or split window, where it stopped a column short ([#3](https://github.com/sherif-fanous/pi-notification-center/pull/3))
- Stop showing a blank row between every line of a notification written with Windows line endings, and stop cutting such a notification short early ([#3](https://github.com/sherif-fanous/pi-notification-center/pull/3))
- Keep coloured text coloured on every line of a multiline notification ([#3](https://github.com/sherif-fanous/pi-notification-center/pull/3))
- Scroll a full page through a long notification on the first press of a page key ([#3](https://github.com/sherif-fanous/pi-notification-center/pull/3))

## [0.2.0] - 2026-09-04

### Changed

- Size the history browser to the notification you are reading. A message that fits the terminal is shown in full instead of being squeezed into a fixed height ([#1](https://github.com/sherif-fanous/pi-notification-center/pull/1))
- Show where you are in a long message. The detail pane names the visible range, and arrows mark the edges that have more text above or below ([#1](https://github.com/sherif-fanous/pi-notification-center/pull/1))
- Fit toast cards to the message. A short notification no longer draws a wide, mostly empty card, and the width setting is now the widest a card may grow rather than a fixed size ([#1](https://github.com/sherif-fanous/pi-notification-center/pull/1))
- Widen the default toast from 50 to 64 columns so fewer notifications are cut short ([#1](https://github.com/sherif-fanous/pi-notification-center/pull/1))
- Show toasts on terminals narrower than your configured width. Cards shrink to fit instead of disappearing ([#1](https://github.com/sherif-fanous/pi-notification-center/pull/1))

## [0.1.0] - 2026-09-03

### Added

- Show notifications from other extensions as toasts in the top-right corner instead of rows in the chat transcript. Toasts stack, expire on their own, and never take keyboard focus ([`af75c57`](https://github.com/sherif-fanous/pi-notification-center/commit/af75c57))
- Add `/notifications`, a two-pane browser for everything captured in the current session. The list shows notifications newest first with color-coded severities, and the detail pane shows the selected message in full ([`af75c57`](https://github.com/sherif-fanous/pi-notification-center/commit/af75c57))
- Add optional configuration at `~/.pi/agent/notification-center/config.json` for how many toasts show at once and for each card's lifetime, height, and width ([`af75c57`](https://github.com/sherif-fanous/pi-notification-center/commit/af75c57))

[0.2.1]: https://github.com/sherif-fanous/pi-notification-center/releases/tag/v0.2.1
[0.2.0]: https://github.com/sherif-fanous/pi-notification-center/releases/tag/v0.2.0
[0.1.0]: https://github.com/sherif-fanous/pi-notification-center/releases/tag/v0.1.0
