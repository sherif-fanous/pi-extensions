# pi-presets-plus

A [Pi](https://github.com/earendil-works/pi) extension that bundles a model,
thinking level, tools, and system prompt into switchable presets.

## Why

Pi lets you choose the model, thinking effort, tools, and system prompt
separately. That works for one-off changes. It gets tedious when you keep
returning to the same setups: a fast, cheap model for boilerplate; a heavier
model for tricky design; a "review only" setup with no write tools and a strict
prompt; or separate planning and implementation modes.

Presets Plus saves those settings together as a named preset. You can switch
presets with one keystroke.

## Requirements

- Pi 0.80.5 or newer

The `max` thinking level needs Pi 0.80.6 or newer.

## Install

```shell
pi install npm:@sherif-fanous/pi-presets-plus
```

Or try it without installing:

```shell
pi -e npm:@sherif-fanous/pi-presets-plus
```

To uninstall:

```shell
pi remove npm:@sherif-fanous/pi-presets-plus
```

## Usage

1. Run `/presets` in any Pi session to open the preset picker.
2. Press `n` to create a new preset, or `e` to edit an existing one.
3. Press `Enter` on the Prompt row to open the multi-line prompt editor, or
   press `F1` on any row to get help for that row.
4. Save your preset and, optionally, give it a hotkey. From then on, pressing
   the hotkey switches to the preset. Run `/presets clear` to go back to Pi's
   defaults.

### Commands

| Command                       | What it does                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `/presets`                    | Opens the picker.                                                                            |
| `/presets <name>`             | Activates the named preset.                                                                  |
| `/presets clear`              | Clears the active preset and returns to Pi's defaults.                                       |
| `/presets reload`             | Re-reads your configuration files after you edit them by hand.                               |
| `/presets status`             | Shows the active preset compared to Pi's defaults, and the state of each configuration file. |
| `/presets policy`             | Shows allowed and prohibited presets for the current directory.                              |
| `/presets show-prompt [name]` | Shows the active preset's prompt, or the named preset's prompt.                              |

Start Pi with `--preset <name>` to activate a preset at startup:

```shell
pi --preset plan
```

### The picker

The picker lists your presets and activates the one you choose. It can also
filter by name, switch scopes, reorder presets, make copies, and delete them.
Its footer lists the keys that work at that moment.

| Key                 | Action                              |
| :------------------ | :---------------------------------- |
| `↑` / `↓`           | Move the selection                  |
| `PgUp` / `PgDn`     | Move one page                       |
| `←` / `→`           | Switch the scope filter             |
| `Enter`             | Activate the selected preset        |
| `n`                 | Create a preset                     |
| `e`                 | Edit the selected preset            |
| `d`                 | Duplicate the selected preset       |
| `x`                 | Delete the selected preset          |
| `c`                 | Clear the active preset             |
| `s`                 | Show the active preset's status     |
| `Ctrl+↑` / `Ctrl+↓` | Move the selected preset up or down |
| `/`                 | Filter by name                      |
| `Esc`               | Close                               |

While you type a filter, `↑` / `↓` and `PgUp` / `PgDn` still move the selection,
and `Enter` or `Esc` goes back to the list. If you have remapped Pi's keys, the
picker follows your bindings.

### The preset editor

The preset editor opens from the picker. Its footer lists the keys for the
focused row.

| Key                             | Action                                                  |
| :------------------------------ | :------------------------------------------------------ |
| `Tab` / `Shift+Tab` / `↑` / `↓` | Move between rows                                       |
| `←` / `→`                       | Change the value, or move between tools                 |
| `Enter`                         | Search, edit the prompt, toggle a tool, or run a button |
| `Space`                         | Switch the tools mode, or run the selected button       |
| `F1`                            | Show help for the focused row                           |
| `Ctrl+S`                        | Save                                                    |
| `Ctrl+T`                        | Test the preset without saving                          |
| `Esc`                           | Cancel                                                  |

If you have remapped Pi's keys, the editor follows your bindings.

## Configuration

Presets Plus reads one `config.json` per scope:

| Scope   | Path                                   |
| :------ | :------------------------------------- |
| User    | `~/.pi/agent/presets-plus/config.json` |
| Project | `.pi/presets-plus/config.json`         |

The Project path is relative to the directory Pi starts in. If you set
`PI_CODING_AGENT_DIR`, it replaces `~/.pi/agent`. Presets from both files are
available, and a Project preset takes precedence over a User preset with the
same name. For `showInactiveStatus`, the Project value wins over the User value,
which wins over the default. Policy rules are read only from the User file.

Presets Plus reads, migrates, and saves the Project file only while Pi trusts
the project. In an untrusted project it skips the file, warns when the session
starts and on `/presets reload`, and shows `skipped (untrusted)` in
`/presets status`. An untrusted project without the file stays silent. See [Pi's
project trust documentation][pi-project-trust] for how to trust a project.

Neither file exists until you save a preset or create it yourself. This User
file has every setting at its default:

```json
{
  "version": 2,
  "showInactiveStatus": true,
  "presets": [],
  "policy": { "rules": [] }
}
```

The following table lists the keys. Paths use `[]` for an item in an array. A
Project file supports every key except `policy`, which produces a warning there.

| Key                                 | Default  | Description                                                                                                 |
| :---------------------------------- | :------- | :---------------------------------------------------------------------------------------------------------- |
| `version`                           | `2`      | The file format. A file without it reads as version 2. A file with another value is ignored with a warning. |
| `showInactiveStatus`                | `true`   | Set to `false` to hide `Preset: none` when no preset is active.                                             |
| `presets`                           | `[]`     | An array of preset objects.                                                                                 |
| `presets[].name`                    | required | Unique name within the file.                                                                                |
| `presets[].provider`                | required | Provider that hosts the model.                                                                              |
| `presets[].model`                   | required | Model identifier.                                                                                           |
| `presets[].thinkingLevel`           | none     | Reasoning level to request: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.                   |
| `presets[].tools`                   | none     | Exact tool list. Omit it or leave it empty to keep the active tools.                                        |
| `presets[].instructions`            | none     | Extra instructions added to Pi's system prompt.                                                             |
| `presets[].hotkey`                  | none     | Key combination that activates the preset.                                                                  |
| `presets[].order`                   | none     | Ordering value preserved in the file. The array order is used.                                              |
| `policy`                            | none     | Directory rules. Only the User file supports this key.                                                      |
| `policy.rules`                      | `[]`     | Array of directory policy rules.                                                                            |
| `policy.rules[].match`              | required | Regular expression tested against the current working directory.                                            |
| `policy.rules[].allow`              | none     | Matchers that form the allow list. If present, a preset must match one of them.                             |
| `policy.rules[].prohibit`           | none     | Matchers that prevent activation. Prohibited matches override allowed matches.                              |
| `policy.rules[].default`            | none     | Matcher used to choose a preset in a fresh session.                                                         |
| `policy.rules[].allow[].field`      | `name`   | Field to test: `name`, `provider`, or `model`.                                                              |
| `policy.rules[].allow[].pattern`    | required | Regular expression tested against the selected field.                                                       |
| `policy.rules[].prohibit[].field`   | `name`   | Field to test: `name`, `provider`, or `model`.                                                              |
| `policy.rules[].prohibit[].pattern` | required | Regular expression tested against the selected field.                                                       |
| `policy.rules[].default.field`      | `name`   | Field to test: `name`, `provider`, or `model`.                                                              |
| `policy.rules[].default.pattern`    | required | Regular expression tested against the selected field.                                                       |

A preset looks like this:

```json
{
  "name": "plan",
  "provider": "anthropic",
  "model": "claude-opus-4-5",
  "thinkingLevel": "high",
  "hotkey": "ctrl+alt+p"
}
```

### Applying changes

Pi reads this file at session start. Run `/reload` after editing it. Instead,
`/presets reload` re-reads both files in place: it loads the new presets and the
`showInactiveStatus` setting at once, shows any configuration warnings again,
and names the presets whose hotkey changes still need `/reload`. Policy rules
are read each time a preset activates. Saving from the picker or the editor
writes the file directly, and offers a reload when a hotkey changed.

### Migrating from 0.10 and earlier

Version 0.10 and earlier kept presets, settings, and policy rules in separate
files. When a session starts, Presets Plus moves them into one `config.json` per
scope and says so in one message naming the files it wrote:

- User scope: `~/.pi/agent/presets-plus/config.json` (version 1),
  `presets.json`, and `policy.json` become one version 2 `config.json`.
- Project scope: `.pi/presets-plus/presets.json` becomes
  `.pi/presets-plus/config.json`. This happens only while Pi trusts the project;
  in an untrusted project the old file stays, and the session start warning
  names it.

The old files are deleted only after the new file is written. If any old file in
a scope is unreadable, is not valid JSON, or lacks `"version": 1`, nothing in
that scope changes, the scope starts empty for that session, and a warning names
the file. Fix or remove that file, then run `/reload` or start a new session to
retry. You can also write the version 2 `config.json` yourself. Once a
`config.json` exists, the old files in that scope are left alone and ignored.

### Directory policy

Policy rules use raw, unanchored JavaScript regular expressions. Rules whose
`match` fits the current directory combine their `allow` and `prohibit`
matchers. The default from the rule with the longest matching directory path
wins, with file order breaking ties. If that default matches several permitted
presets, the first one wins, with user presets ahead of project presets. The
`--preset` flag and a successful session restore take precedence over an
automatic default.

When a command, picker action, flag, or hotkey targets a prohibited preset, Pi
asks whether to Override or Cancel. In RPC mode the client answers that
question; in print and JSON mode nobody can, so the preset is not activated.
Session restore does not run this check. Invalid policy patterns are skipped
with a warning, so they do not block activation. Run `/presets policy` to
inspect the effective policy.

### When directory defaults apply

- Automatic presets apply only in Pi's interactive terminal interface. They do
  not apply in print, JSON, or RPC mode.
- If Pi starts with a different provider, model, or thinking level than your
  saved defaults, Presets Plus leaves them unchanged. This helps prevent a
  directory preset from replacing a choice supplied on the command line or by
  another tool. The comparison includes any project overrides you have allowed
  Pi to load.
- `--preset` and restoration of an existing preset take precedence over the
  directory default. These paths remain available in every mode.
- If Presets Plus cannot read your saved defaults or find the saved model, it
  skips automatic activation without a warning.

### Set your Pi defaults

Pi stores your personal defaults in `~/.pi/agent/settings.json`, separately from
Presets Plus's configuration. A directory default requires a saved provider and
model.

- In current Pi versions, open `/model` and press Ctrl+S on the model you want
  as your startup default.
- Open `/thinking` and press Ctrl+S to save your startup thinking level.
- You can also edit `defaultProvider`, `defaultModel`, and
  `defaultThinkingLevel` directly in the settings file.

See [Pi's settings documentation][pi-settings] for details.

### Project defaults

A project's `.pi/settings.json` can override `defaultProvider`, `defaultModel`,
and `defaultThinkingLevel`. Each project value replaces the corresponding
personal value; omitted fields keep their personal defaults.

Pi loads these overrides only when you allow it to trust the project and load
its local settings. Presets Plus uses that same trust decision when comparing
startup values. Without permission, it uses only your personal defaults.

See [Pi's project trust documentation][pi-project-trust] for how to grant or
change that permission.

### SDK compatibility

Applications that create Pi sessions through its SDK can supply settings in
memory without saving them to a file. In an interactive session, Presets Plus
still compares startup values against the settings files described above. For
example, if an application uses model B while your saved default is model A,
automatic preset activation is skipped. Non-interactive sessions always skip it,
regardless of where their settings come from.

## Limitations

If you explicitly select the same provider, model, and thinking level as your
saved defaults, a directory default can still replace that selection. Presets
Plus cannot tell those matching values apart from an ordinary startup.

## Troubleshooting

Run `/presets status` to compare the active preset with Pi's defaults and see
the state of each configuration file and any warnings. Run `/presets policy` to
see which presets the directory policy allows, prohibits, or picks by default
here.

## License

[MIT](LICENSE)

[pi-settings]:
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md
[pi-project-trust]:
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md#project-trust
