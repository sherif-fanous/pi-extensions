# pi-rtk

[Pi](https://github.com/badlogic/pi-mono) coding agent extension that uses [rtk](https://github.com/rtk-ai/rtk) to reduce LLM token usage for shell command execution.

When `pi-rtk` is loaded, it participates in two Pi shell paths:

- agent-initiated `bash` tool calls
- user-issued `!<cmd>` shell commands whose output is included in model context

In both cases, `pi-rtk` first attempts to rewrite the command with:

```shell
rtk rewrite "<original command>"
```

If rewrite succeeds, Pi executes the rewritten command. If rewrite fails for any reason, `pi-rtk` falls back silently so normal Pi shell behavior continues.

Commands entered with `!!<cmd>` are intentionally not intercepted. They continue through Pi's normal context-excluded shell execution path unchanged.

## Agent `bash` tool calls

`pi-rtk` registers a replacement `bash` tool for Pi. Before the tool executes a command, the extension attempts an `rtk rewrite` and uses the rewritten command when available.

This preserves the normal `bash` tool interface while routing supported commands through `rtk`, which can filter and compress output before it reaches the model.

If `rtk` is unavailable, times out, or cannot rewrite the command, the original command runs unchanged.

### Behavior summary

```text
Agent bash tool call
        │
        ▼
pi-rtk replacement bash tool
        │
        ├─ try: rtk rewrite "<command>"
        │      │
        │      ├─ success -> execute rewritten command
        │      └─ failure -> execute original command unchanged
        │
        ▼
    same bash tool interface to Pi
```

## User `!<cmd>` shell commands

`pi-rtk` also hooks Pi's `user_bash` event for context-visible user shell commands entered with `!<cmd>`.

For these commands, the extension probes rewrite eligibility before claiming the event. If rewrite succeeds, it returns custom bash operations so Pi can keep owning the normal execution lifecycle and UI behavior. If rewrite does not succeed, the extension falls through and Pi handles the command normally.

This keeps optimization best-effort, silent, and non-disruptive during normal operation.

### Behavior summary

```text
User !<cmd>
        │
        ├─ try: rtk rewrite "<command>"
        │      │
        │      ├─ success -> return custom bash operations
        │      └─ failure -> fall through to normal Pi user_bash handling
        │
        ▼
    same user shell experience in Pi
```

## User `!!<cmd>` shell commands

Commands entered with `!!<cmd>` are excluded from model context by design, so `pi-rtk` does not intercept them.

They bypass `pi-rtk` completely and continue through Pi's normal context-excluded shell handling.

### Behavior summary

```text
User !!<cmd>
        │
        ▼
    bypass pi-rtk and use normal Pi context-excluded shell handling
```

## Prerequisites

[rtk](https://github.com/rtk-ai/rtk) is required to get the token-saving optimization behavior and should be [installed](https://github.com/rtk-ai/rtk#installation) and available on your `PATH`.

If `rtk` is unavailable, `pi-rtk` still preserves normal shell behavior by falling back to the original command.

## Install

```shell
pi install npm:@sherif-fanous/pi-rtk
```

Or try without installing:

```shell
pi -e npm:@sherif-fanous/pi-rtk
```

To uninstall:

```shell
pi remove npm:@sherif-fanous/pi-rtk
```
