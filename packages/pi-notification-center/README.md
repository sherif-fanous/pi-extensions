# pi-notification-center

A [Pi](https://github.com/earendil-works/pi) extension that shows notifications
as toasts and keeps a browsable session history.

Extension notifications normally become permanent rows in Pi's chat transcript,
where they crowd out the conversation. Notification Center shows them as toasts
in the top-right corner instead, then keeps them in a browsable history for the
rest of the session.

## Requirements

- Tested only against the latest stable release of
  [Pi](https://github.com/earendil-works/pi)

## Install

```shell
pi install npm:@sherif-fanous/pi-notification-center
```

Or try it without installing:

```shell
pi -e npm:@sherif-fanous/pi-notification-center
```

To uninstall:

```shell
pi remove npm:@sherif-fanous/pi-notification-center
```

Old history entries stay in your session files after you uninstall Notification
Center, but nothing reads them any more.

## Usage

When an extension sends a notification, a small card appears at the top-right
instead of a transcript row. Cards stack downward, oldest at the top, and each
one disappears a few seconds after it arrives. Every notification gets its own
card.

Toasts never take keyboard focus. You can keep typing, and a card that arrives
while a dialog or picker is open will not disturb it.

Long messages are shortened to fit the card, and a card that runs out of room
ends with `…`. `/notifications` always has the full text. On a terminal too
small to show a card safely, nothing appears, but the notification is still
recorded.

Only interactive sessions show toasts. In print (`-p`), JSON, and RPC mode,
notifications behave exactly as they did before you installed Notification
Center.

Everything stays inside Pi's terminal UI. Notification Center never sends
operating-system notifications.

### Commands

| Command                 | What it does                                                                                                                    |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `/notifications`        | Opens the history of this session's notifications.                                                                              |
| `/notifications status` | Shows whether toasts are on, how many notifications this session has captured, the toast settings, and your configuration file. |

### The history browser

`/notifications` opens the history of what this session has captured. The left
pane lists notifications newest first, showing the time, the severity, and the
first line. The right pane shows the selected one in full, with its date, time,
severity, and complete message.

Severities are colored to match your theme: `ERROR` red, `WARN` amber, `INFO`
accent.

Moving past the last notification wraps around to the first. Picking a different
notification scrolls the detail pane back to the top. The footer shows the keys
that work, and offers `PgUp` / `PgDn` only when the selected message is too long
to fit.

| Key             | Action                 |
| :-------------- | :--------------------- |
| `↑` / `↓`       | Move the selection     |
| `PgUp` / `PgDn` | Scroll the detail pane |
| `Esc`           | Close                  |

If you have remapped Pi's keys, the browser follows your bindings.

## Configuration

Notification Center reads one `config.json`, in the User scope only:

| Scope | Path                                          |
| :---- | :-------------------------------------------- |
| User  | `~/.pi/agent/notification-center/config.json` |

`PI_CODING_AGENT_DIR` replaces `~/.pi/agent`. Each setting comes from the file,
then the default, and an invalid value is skipped with a warning so the default
applies. There is no Project file, so the settings are the same in every
project, trusted or not. Nothing creates the file for you; make it yourself if
you want to change something.

```json
{
  "version": 2,
  "toast": {
    "maxVisible": 5,
    "timeoutMs": 3000,
    "maxLines": 5,
    "width": 64
  }
}
```

| Key                | Default | Description                                                                                                         |
| :----------------- | :------ | :------------------------------------------------------------------------------------------------------------------ |
| `version`          | `2`     | Layout of the file. A file without it is read as version 2; a file with any other version is ignored with a warning |
| `toast.maxVisible` | `5`     | How many cards show at once, from 1 to 10                                                                           |
| `toast.timeoutMs`  | `3000`  | How long a card stays, in milliseconds, from 250 to 60000                                                           |
| `toast.maxLines`   | `5`     | How many lines of the message a card shows, from 1 to 20                                                            |
| `toast.width`      | `64`    | How wide, in columns, a card can grow, from 20 to 80                                                                |

Every value is a whole number, and every key is optional. Cards are only as wide
as the longest message on show, so `toast.width` sets the limit rather than the
size. Short notifications stay small, and a narrow terminal shrinks them
further.

Pi reads this file at session start. Run `/reload` after editing it.
`/notifications status` shows the settings in use and the file with its state:
`loaded`, `not found`, `invalid` with the reason, or `skipped (untrusted)`.

### Migrating from 0.2 and earlier

Notification Center 0.2 called two settings `maxToastsVisible` and
`toast.timeout`, and its file had no `version`. At session start, Notification
Center renames `maxToastsVisible` to `toast.maxVisible` and `toast.timeout` to
`toast.timeoutMs`, adds `version`, and saves the file. It shows one message
naming the file. A setting you already wrote under its new name wins, and the
old one is dropped.

If the file can't be saved, Notification Center warns, leaves the file as it is,
and still uses your settings for the session. Fix the problem, for example the
file's permissions, and run `/reload` to migrate it, or rename the keys
yourself.

## Limitations

Not every message in that corner of the screen is a notification. Pi draws its
own status, warning, and error rows directly, and some extensions write to the
transcript instead of sending a notification. Those messages keep appearing as
they always have.

Notifications sent before Notification Center loads also go to the transcript.

## Troubleshooting

Run `/notifications status` when toasts don't show up or look wrong. It shows
whether toasts are on, the toast settings in use, and the state of your
configuration file with any warnings.

## License

[MIT](LICENSE)
