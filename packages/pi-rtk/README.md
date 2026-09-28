# pi-rtk

A [Pi](https://github.com/earendil-works/pi) extension that routes shell
commands through [rtk](https://github.com/rtk-ai/rtk) to reduce LLM token usage.

RTK handles two of Pi's shell paths:

- the agent's `bash` tool calls
- your `!<cmd>` shell commands, whose output goes into the model's context

In both cases, RTK first tries to rewrite the command with:

```shell
rtk rewrite "<original command>"
```

If the rewrite succeeds, Pi runs the rewritten command. If it fails for any
reason, RTK falls back silently and Pi runs the original command as usual.

RTK leaves commands entered with `!!<cmd>` alone. They keep going through Pi's
normal shell path, which keeps their output out of the model's context.

## Requirements

- Tested only against the latest stable release of
  [Pi](https://github.com/earendil-works/pi)
- [rtk](https://github.com/rtk-ai/rtk), installed and on your `PATH`

Without the rtk binary, RTK still runs every command, unchanged.

## Install

```shell
pi install npm:@sherif-fanous/pi-rtk
```

Or try it without installing:

```shell
pi -e npm:@sherif-fanous/pi-rtk
```

To uninstall:

```shell
pi remove npm:@sherif-fanous/pi-rtk
```

## Usage

No setup is needed. Once installed, RTK rewrites the agent's shell commands and
your `!<cmd>` commands. Use `/rtk` to turn rewriting off and on again.

### Commands

| Command        | What it does                                                                                                                         |
| :------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `/rtk`         | Opens a menu, titled with the current state, with the same actions. Outside Pi's interactive terminal UI it shows the status report. |
| `/rtk enable`  | Turns command rewriting on for the running Pi process, across `/new`, `/resume`, and `/fork`, until Pi restarts.                     |
| `/rtk disable` | Turns command rewriting off for the running Pi process, across `/new`, `/resume`, and `/fork`, until Pi restarts.                    |
| `/rtk status`  | Shows whether rewriting is on, the detected rtk binary's version and path, and a bypass tip.                                         |

### The `/rtk` menu

The menu shows the current state in its title and lists the same actions as the
subcommands: start rewriting, stop rewriting, or show the status.

| Key       | Action                  |
| :-------- | :---------------------- |
| `↑` / `↓` | Move the selection      |
| `Enter`   | Run the selected action |
| `Esc`     | Close without choosing  |

If you have remapped Pi's keys, the menu follows your bindings.

### Footer status

The footer shows whether RTK is working: a dim `RTK: on` when rewriting is on
and the rtk binary runs, a dim `RTK: off` when rewriting is off, and
`RTK: unavailable` in the warning color when rewriting is on but the rtk binary
is missing from `PATH` or can't run.

To skip rtk for a single command while leaving rewriting on, use rtk's
per-command form:

```shell
!RTK_DISABLED=1 <cmd>
```

## Configuration

RTK has no configuration file. `/rtk enable` and `/rtk disable` last until Pi
restarts, and every new Pi process starts with rewriting on.

## How it works

### Agent `bash` tool calls

RTK registers a replacement `bash` tool for Pi. Before the tool runs a command,
RTK tries an `rtk rewrite` and uses the rewritten command when there is one.

The `bash` tool keeps its usual interface while supported commands go through
rtk, which can filter and compress output before it reaches the model.

If the rtk binary is missing, times out, or can't rewrite the command, the
original command runs unchanged.

```text
Agent bash tool call
        │
        ▼
RTK replacement bash tool
        │
        ├─ try: rtk rewrite "<command>"
        │      │
        │      ├─ success -> execute rewritten command
        │      └─ failure -> execute original command unchanged
        │
        ▼
    same bash tool interface to Pi
```

### Your `!<cmd>` shell commands

RTK also handles the shell commands you enter with `!<cmd>`, whose output the
model sees.

For these commands, RTK tries the rewrite before it takes over the command. If
the rewrite succeeds, Pi runs the rewritten command with its usual handling and
display. If it doesn't, Pi handles the command normally.

Rewriting stays best-effort, silent, and out of your way.

```text
User !<cmd>
        │
        ├─ try: rtk rewrite "<command>"
        │      │
        │      ├─ success -> Pi runs the rewritten command
        │      └─ failure -> Pi runs the original command normally
        │
        ▼
    same user shell experience in Pi
```

### Your `!!<cmd>` shell commands

Commands entered with `!!<cmd>` are kept out of the model's context by design,
so RTK doesn't touch them. They go through Pi's normal shell path.

```text
User !!<cmd>
        │
        ▼
    bypass RTK and use Pi's normal shell path
```

## Limitations

RTK is a rewrite shim. It doesn't gate, prompt for, sandbox, or deny commands
based on their content, even when `rtk rewrite` returns a deny verdict.

That scope is intentional. rtk's deny verdict comes from a permission source
that doesn't match Pi's permission model, and Pi's built-in approval flow plus
Pi's extension ecosystem cover command gating better as composable layers.

If you want command-level permissions, guardrails, or shields, install a
dedicated Pi extension for that. Browse
[pi.dev/packages](https://pi.dev/packages) filtered by extension and search for
terms like `permission`, `guardrail`, or `shield`.

Those extensions work alongside RTK: they block disallowed commands when they
run, whether or not RTK rewrote them.

## Troubleshooting

Run `/rtk status` to see whether rewriting is on and which rtk binary RTK found.
When the footer reads `RTK: unavailable`, install rtk or fix its permissions;
the footer updates the next time RTK runs the binary, for example on the next
shell command or `/rtk status`.

## License

[MIT](LICENSE)
