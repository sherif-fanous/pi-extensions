# pi-notification-center

A notification center for [Pi](https://github.com/earendil-works/pi).

Extension notifications normally become permanent rows in Pi's chat
transcript, where they crowd out the conversation. This extension shows
them as toasts in the top-right corner instead, then keeps them in a
browsable history for the rest of the session.

## Install

```shell
pi install npm:@sherif-fanous/pi-notification-center
```

To try it from a clone of this repository without installing:

```shell
pi -e .
```

To remove it:

```shell
pi remove npm:@sherif-fanous/pi-notification-center
```

Old history entries stay in your session files after you remove the
extension, but nothing reads them any more.

## What you will see

When an extension sends a notification, a small card appears at the
top-right instead of a transcript row. Cards stack downward, oldest at the
top, and each one disappears a few seconds after it arrives. Every
notification gets its own card.

Toasts never take keyboard focus. You can keep typing, and a card that
arrives while a dialog or picker is open will not disturb it.

Long messages are shortened to fit the card, and a card that runs out of
room ends with `…`. `/notifications` always has the full text. On a
terminal too small to show a card safely, nothing appears, but the
notification is still recorded.

Only interactive sessions show toasts. In print (`-p`), JSON, and RPC
mode, notifications behave exactly as they did before you installed this.

Everything stays inside Pi's terminal UI. The extension never sends
operating-system notifications.

## `/notifications`

Run `/notifications` to browse what this session has captured. The left
pane lists notifications newest first, showing the time, the severity, and
the first line. The right pane shows the selected one in full, with its
date, time, severity, and complete message.

Severities are colored to match your theme: `ERROR` red, `WARN` amber,
`INFO` accent.

| Key             | Action                 |
| :-------------- | :--------------------- |
| `↑` / `↓`       | Move the selection     |
| `PgUp` / `PgDn` | Scroll the detail pane |
| `Esc`           | Close                  |

Picking a different notification scrolls the detail pane back to the top.
If you have remapped Pi's keys, the browser follows your bindings.

## Configuration

Configuration is optional and global. Nothing is created for you, so make
the file yourself if you want to change something.

`~/.pi/agent/notification-center/config.json`:

```json
{
  "maxToastsVisible": 5,
  "toast": {
    "timeout": 3000,
    "maxLines": 5,
    "width": 64
  }
}
```

| Setting            | Default | Valid range                    |
| :----------------- | ------: | :----------------------------- |
| `maxToastsVisible` |       5 | integer from 1 through 10      |
| `toast.timeout`    |    3000 | integer from 250 through 60000 |
| `toast.maxLines`   |       5 | integer from 1 through 20      |
| `toast.width`      |      64 | integer from 20 through 80     |

`maxToastsVisible` caps how many cards show at once. The `toast` settings
describe one card: how long it stays (`timeout`, in milliseconds), how
tall it can grow (`maxLines`), and how wide it can grow (`width`).

Cards are only as wide as the longest message on show, so `width` sets
the limit rather than the size. Short notifications stay small, and a
narrow terminal shrinks them further.

Every key is optional, so omit the ones you are happy with. If a value is
unusable the extension keeps the default for it, warns you once, and
carries on.

Pi reads the file when a session starts. Run `/reload` or start a new
session to pick up your edits. If you set `PI_CODING_AGENT_DIR`, the file
is read from there instead of `~/.pi/agent`.

## What it does not catch

Not every message in that corner of the screen is a notification. Pi draws
its own status, warning, and error rows directly, and some extensions
write to the transcript instead of sending a notification. Those messages
keep appearing as they always have.

Notifications sent before the extension loads also go to the transcript.

## License

[MIT](LICENSE)
