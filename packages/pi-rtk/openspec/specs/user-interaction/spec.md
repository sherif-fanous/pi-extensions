# user-interaction Specification

## Purpose

Define the user-visible behavior of `pi-rtk`, including transparency during
normal operation and resilience when shell optimization fails.

## Requirements

### Requirement: Non-disruptive fallback

Failures in the shell optimization layer MUST NOT interrupt normal shell tool
usage.

#### Scenario: Optimization failure

- **GIVEN** a command submitted to the `bash` tool
- **WHEN** shell optimization fails before command execution
- **THEN** the command MUST still execute using normal shell behavior
- **AND** the optimization failure MUST NOT crash, block, or disable the host
  agent

### Requirement: Transparent operation

The optimization layer MUST remain invisible during normal use.

#### Scenario: Standard command execution

- **GIVEN** normal shell command execution through the `bash` tool
- **THEN** the system MUST NOT add user-facing notifications solely to report
  optimization activity
- **AND** the user experience MUST remain consistent whether optimization is
  applied or bypassed

### Requirement: Graceful operation without `rtk`

The system MUST continue to provide normal shell execution when `rtk` is
unavailable.

#### Scenario: `rtk` is unavailable

- **GIVEN** `rtk` is not installed, not resolvable on `PATH`, or otherwise
  unavailable to the optimization layer
- **WHEN** a command is submitted to the `bash` tool
- **THEN** the system MUST execute the original command unchanged
- **AND** the user MUST retain normal shell tool functionality

### Requirement: Respect for user context visibility choice

The system MUST preserve the semantic distinction between Pi's context-visible
and context-excluded user shell command modes.

#### Scenario: User selects context-visible shell mode

- **WHEN** a user executes a shell command using Pi's `!<cmd>` syntax while
  `pi-rtk` is loaded
- **THEN** the command MUST remain eligible for optimization behavior
- **AND** successful optimization MUST preserve the normal experience of running
  a user shell command in Pi

#### Scenario: User selects context-excluded shell mode

- **WHEN** a user executes a shell command using Pi's `!!<cmd>` syntax while
  `pi-rtk` is loaded
- **THEN** the command MUST bypass `pi-rtk` optimization behavior
- **AND** the user's choice to exclude output from model context MUST be
  respected

### Requirement: Transparent user bash optimization

The system MUST keep user bash optimization non-disruptive during normal
operation.

#### Scenario: Optimization succeeds for a user shell command

- **WHEN** a supported shell command executed through Pi's `!<cmd>` syntax is
  optimized successfully
- **THEN** the command MUST complete without requiring additional user
  interaction solely for optimization reporting
- **AND** the user experience MUST remain consistent with normal shell execution

### Requirement: Session-scoped rewrite toggle

The extension MUST expose an in-memory, session-scoped toggle that controls
whether `pi-rtk` performs rewrites. The toggle's default state MUST be
`enabled`. The toggle MUST reset to `enabled` on every Pi process start. The
toggle MUST NOT be persisted to disk.

#### Scenario: /rtk disable turns the toggle off

- **GIVEN** the rewriting toggle is in any state
- **WHEN** the user invokes `/rtk disable`
- **THEN** the toggle MUST transition to `disabled`
- **AND** the extension MUST surface a user-facing confirmation
- **AND** the footer indicator MUST update to reflect the disabled state

#### Scenario: /rtk enable turns the toggle on

- **GIVEN** the rewriting toggle is in any state
- **WHEN** the user invokes `/rtk enable`
- **THEN** the toggle MUST transition to `enabled`
- **AND** the extension MUST surface a user-facing confirmation
- **AND** the footer indicator MUST update to reflect the enabled state

#### Scenario: Toggle survives a session switch

- **GIVEN** the user has invoked `/rtk disable`
- **WHEN** the user switches session with `/new`, `/resume`, or `/fork`
- **THEN** the rewriting toggle MUST remain `disabled`

#### Scenario: Toggle resets on new Pi process

- **WHEN** Pi exits and is launched again
- **THEN** the rewriting toggle MUST start in the `enabled` state
- **AND** no toggle state MUST be read from disk

### Requirement: Persistent footer state indicator

The extension MUST register a single footer status entry via
`ctx.ui.setStatus("rtk", ...)` and MUST keep that entry present for the lifetime
of the extension. The entry MUST reflect both the rewriting toggle and whether
the `rtk` binary runs:

- `RTK: on` in the theme's `dim` color when the toggle is `enabled` and the last
  spawn of `rtk` succeeded (or none has failed yet).
- `RTK: off` in the theme's `dim` color when the toggle is `disabled`, whatever
  the binary's availability.
- `RTK: unavailable` in the theme's `warning` color when the toggle is `enabled`
  and the last spawn of `rtk` failed with `ENOENT` or `EACCES`.

The entry MUST update immediately when the rewriting toggle changes and whenever
a spawn of `rtk` (the `session_start` probe, a rewrite, or `/rtk status`)
changes the binary's availability. Other spawn failures, such as a timeout, MUST
NOT change the entry.

#### Scenario: Indicator present on load

- **GIVEN** `rtk` runs
- **WHEN** Pi fires `session_start`
- **THEN** the footer MUST display the `rtk` status entry as dim `RTK: on`

#### Scenario: Indicator shows a missing binary at session start

- **GIVEN** `rtk` is not on PATH or not executable
- **WHEN** Pi fires `session_start`
- **THEN** the footer entry MUST read `RTK: unavailable` in warning color

#### Scenario: Indicator updates on toggle

- **WHEN** the user invokes `/rtk disable`
- **THEN** the footer entry MUST read dim `RTK: off`
- **AND** when the user then invokes `/rtk enable`, the entry MUST return to
  `RTK: on` or `RTK: unavailable` according to the binary's availability

#### Scenario: Indicator follows availability detected mid-session

- **GIVEN** the footer entry reads `RTK: on`
- **WHEN** a rewrite spawn of `rtk` fails with `ENOENT` or `EACCES`
- **THEN** the footer entry MUST change to `RTK: unavailable` in warning color
- **AND** when a later spawn of `rtk` succeeds, the entry MUST return to dim
  `RTK: on`

### Requirement: /rtk bare invocation opens settings overlay

The extension MUST treat the bare `/rtk` invocation (no arguments) as a request
for a settings overlay. The overlay MUST allow the user to select among the same
actions exposed by the subcommands. Its title MUST be the footer entry's text
(`RTK: on`, `RTK: off`, or `RTK: unavailable`), and each item MUST be the
subcommand's completion description:

- `Rewrite shell commands with RTK` for `enable`
- `Stop rewriting shell commands` for `disable`
- `Show RTK status` for `status`

The menu opens wherever Pi has a UI (TUI and RPC mode). In print and JSON mode,
bare `/rtk` MUST NOT open it and MUST deliver the `/rtk status` report instead.

#### Scenario: Bare /rtk opens overlay

- **WHEN** the user invokes `/rtk` with no arguments in TUI or RPC mode
- **THEN** the extension MUST display an interactive selection overlay titled
  with the current footer text and listing the three descriptions above
- **AND** selecting an item MUST execute the corresponding subcommand
- **AND** dismissing the overlay MUST NOT change any state

#### Scenario: Bare /rtk in print or JSON mode

- **WHEN** the user invokes `/rtk` with no arguments in print or JSON mode
- **THEN** the extension MUST NOT open the selection overlay
- **AND** the extension MUST deliver the same report as `/rtk status`

### Requirement: /rtk status report

`/rtk status` MUST report the current rewriting toggle state and the detected
`rtk` binary identity, and MUST include a static educational tip about rtk's
per-command `!RTK_DISABLED=1 <cmd>` bypass. The tip MUST be plain documentation
text — the extension MUST NOT read environment variables when producing the
status report.

The report MUST be a command report whose first line is the heading
`RTK Status`, followed by three rows whose values are aligned to the longest
label:

- `Rewriting:` with `on` or `off`
- `Binary:` with the detected `rtk` version and path, or
  `rtk not detected on PATH`
- `Tip:` with `Bypass rtk for one command with !RTK_DISABLED=1 <cmd>.`

In TUI mode the report MUST appear as a transcript entry that does not enter LLM
context and that still renders after the session is reloaded. In every other
mode the report MUST be delivered as one info-level notification. In both cases
the heading MUST render bold and accent-colored and each row label MUST render
muted; the toggle value MUST NOT carry its own color.

#### Scenario: Status reports current state

- **WHEN** the user invokes `/rtk status`
- **THEN** the report MUST start with the `RTK Status` heading
- **AND** the `Rewriting:` row MUST identify the current rewriting toggle state
  (`on` or `off`)
- **AND** the `Binary:` row MUST identify the detected `rtk` binary version and
  path, or MUST clearly indicate when `rtk` is not on PATH
- **AND** the `Tip:` row MUST mention the per-command `!RTK_DISABLED=1 <cmd>`
  bypass

#### Scenario: Status in TUI mode

- **WHEN** the user invokes `/rtk status` in TUI mode
- **THEN** the report MUST appear as a transcript entry instead of a
  notification
- **AND** the entry MUST NOT be sent to the LLM
- **AND** the entry MUST still render, styled with the current theme, after the
  session is reloaded

#### Scenario: Status outside TUI mode

- **WHEN** the user invokes `/rtk status` in a mode other than TUI
- **THEN** the report MUST be delivered as one info-level notification

#### Scenario: Status does not inspect process environment

- **WHEN** the user invokes `/rtk status`
- **THEN** the extension MUST NOT read `process.env.RTK_DISABLED` or any other
  process environment variable as part of building the status output
- **AND** the per-command tip MUST appear regardless of the host environment

### Requirement: No refusal on rtk permission verdict

The system MUST NOT refuse to execute a shell command based on a permission
verdict surfaced by `rtk rewrite`. Command-level refusal is the responsibility
of Pi's built-in approval flow or of a dedicated Pi permission extension
installed by the user.

#### Scenario: rtk surfaces a deny verdict

- **WHEN** `rtk rewrite` indicates that a shell command submitted to `pi-rtk`
  matches a deny rule
- **THEN** `pi-rtk` MUST NOT block command execution
- **AND** the command MUST continue through Pi's normal shell execution path
- **AND** `pi-rtk` MUST NOT emit a refusal message of its own

#### Scenario: rtk surfaces a non-deny verdict

- **WHEN** `rtk rewrite` returns an allow, no-equivalent, or ask verdict for a
  shell command submitted to `pi-rtk`
- **THEN** existing rewrite and fall-through behavior MUST apply unchanged
- **AND** the new requirement MUST NOT alter handling of those verdicts

### Requirement: User notification when rtk is unavailable

The system MUST emit at most one user-visible warning-level notification per
transition from "rtk works" to "rtk does not work" within a single Pi process.
The notification MUST originate from Pi's TUI notification surface (e.g.,
`ctx.ui.notify`). The unavailability conditions that trigger the notification
MUST be strictly `ENOENT` (binary not on PATH) and `EACCES` (binary present but
not executable). All other spawn-failure conditions, including timeout and
signal interruption, MUST remain silent.

#### Scenario: rtk missing at session start

- **GIVEN** `rtk` is not on PATH when Pi starts
- **WHEN** the extension receives Pi's `session_start` event
- **THEN** the extension MUST emit one warning-level notification identifying
  that the `rtk` binary was not found on PATH
- **AND** the notification MUST include an actionable install pointer

#### Scenario: rtk missing at first user bash activity

- **GIVEN** `rtk` is not on PATH when Pi starts
- **WHEN** the user's first relevant interaction is a context-visible `!<cmd>`
  user shell command
- **THEN** the extension MUST emit one warning-level notification identifying
  that the `rtk` binary was not found on PATH
- **AND** the notification MUST include an actionable install pointer

#### Scenario: rtk present but not executable at session start

- **GIVEN** `rtk` is on PATH but the file is not executable when Pi starts
- **WHEN** the extension receives Pi's `session_start` event
- **THEN** the extension MUST emit one warning-level notification identifying
  that the `rtk` binary is not executable
- **AND** the notification MUST include an actionable remedy hint (for example,
  a `chmod` suggestion)

#### Scenario: rtk removed mid-session

- **GIVEN** `rtk` was available earlier in the session and the extension is in
  the "rtk works" state with no pending notification
- **WHEN** `rtk` becomes unavailable (uninstalled or chmod -x'd) and the user
  invokes a shell command that triggers `rtkRewriteCommand`
- **THEN** the extension MUST emit one warning-level notification describing the
  current unavailability condition (ENOENT or EACCES) at the time of detection

#### Scenario: rtk restored mid-session after a notification

- **GIVEN** a notification has already fired during the current unavailability
  transition
- **WHEN** `rtk` becomes available again and a subsequent `rtkRewriteCommand`
  `spawnSync` call returns without an error
- **THEN** the extension MUST reset its notification gate so that a later
  unavailability transition can emit a fresh notification

#### Scenario: rtk uninstalled twice in one session

- **GIVEN** a notification fired for an earlier unavailability transition and
  the extension's notification gate has been reset by a successful spawn in
  between
- **WHEN** `rtk` becomes unavailable again
- **THEN** the extension MUST emit one fresh warning-level notification for the
  new unavailability transition

#### Scenario: Repeated unavailable spawns within one transition

- **GIVEN** a notification has already fired for the current unavailability
  transition and no successful spawn has occurred since
- **WHEN** additional `rtkRewriteCommand` invocations occur and also fail with
  `ENOENT` or `EACCES`
- **THEN** the extension MUST NOT emit additional notifications for those
  repeated failures

#### Scenario: Non-availability spawn failures remain silent

- **WHEN** a `rtkRewriteCommand` `spawnSync` call fails with a reason other than
  `ENOENT` or `EACCES` (such as timeout, EPIPE, signal interrupt, or any unknown
  error code)
- **THEN** the extension MUST NOT emit a user-facing notification
- **AND** the extension MUST continue to fall through to Pi's normal shell
  behavior unchanged
