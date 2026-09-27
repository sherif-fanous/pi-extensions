# extension-scaffolding Specification

## Purpose

Give Pi extension entry points one way to report command and event handler
failures, complete fixed subcommands, and detect the interactive terminal UI, so
every extension words its failures alike and none redefines the same wrappers.

## Requirements

### Requirement: Command failures become error notifications

The package SHALL export a `guardCommand(extensionName, handler)` function
returning a command handler with the same parameters as `handler`. When
`handler` throws or rejects, the returned handler SHALL notify
`<extensionName> command failed: <message>` at `error` severity and resolve, and
SHALL NOT rethrow the error. `<message>` SHALL be the `describeError` text of
the thrown value, followed by a full stop unless it already ends in `.`, `!`, or
`?`.

#### Scenario: A message without a terminator

- **WHEN** a guarded command handler rejects with an `Error` whose message is
  `disk full`
- **THEN** the guard notifies `<extensionName> command failed: disk full.` at
  `error` severity
- **AND** the returned handler resolves instead of rejecting

#### Scenario: A message that already ends a sentence

- **WHEN** a guarded command handler throws an `Error` whose message is
  `Disk full.`
- **THEN** the guard notifies `<extensionName> command failed: Disk full.` with
  exactly one full stop

#### Scenario: A handler that succeeds

- **WHEN** a guarded command handler resolves
- **THEN** the guard does not notify

### Requirement: Event failures become error notifications

The package SHALL export a `guardEvent(extensionName, eventName, handler)`
function returning a `pi.on` handler. When `handler` succeeds, the returned
handler SHALL resolve to `handler`'s result unchanged. When `handler` throws or
rejects, the returned handler SHALL notify
`<extensionName> <eventName> failed: <message>` at `error` severity, with
`<message>` formed as for `guardCommand`, and SHALL resolve to `undefined`.

#### Scenario: A handler result passes through

- **WHEN** a guarded `before_agent_start` handler returns a system prompt
- **THEN** the returned handler resolves to that same result
- **AND** the guard does not notify

#### Scenario: A handler fails

- **WHEN** a guarded handler for `session_start` rejects with an `Error` whose
  message is `Disk full!`
- **THEN** the guard notifies `<extensionName> session_start failed: Disk full!`
  at `error` severity
- **AND** the returned handler resolves to `undefined`

### Requirement: Guards never reject when reporting fails

`guardCommand` and `guardEvent` SHALL report failures on a best-effort basis.
When the context's `notify` itself throws, for example because Pi has already
replaced the session, the returned handler SHALL still resolve.

#### Scenario: A stale context

- **WHEN** a guarded handler fails and the context's `notify` throws
- **THEN** the returned handler resolves instead of rejecting

### Requirement: Fixed subcommands complete on the first word

The package SHALL export a `subcommandCompletions(subcommands)` function that
takes a list of `{ name, description? }` entries and returns a
`getArgumentCompletions` function. That function SHALL ignore leading whitespace
in the argument prefix, return `null` when the rest contains a space, and
otherwise return every subcommand whose name starts with the prefix as
`{ value: name, label }`, in list order, or `null` when none match.

#### Scenario: A first-word prefix

- **WHEN** the argument prefix is `st`, optionally after leading whitespace, and
  a subcommand is named `status`
- **THEN** the completions include `status`

#### Scenario: A prefix past the first word

- **WHEN** the argument prefix, after leading whitespace, contains a space
- **THEN** the function returns `null`

#### Scenario: No subcommand matches

- **WHEN** no subcommand name starts with the argument prefix
- **THEN** the function returns `null`

### Requirement: Subcommand completion labels carry the description

Each completion `subcommandCompletions` returns SHALL be labeled
`<name>: <description>` when its entry has a description, and `<name>`
otherwise.

#### Scenario: A subcommand with a description

- **WHEN** a matching subcommand has a description
- **THEN** its label is `<name>: <description>`

#### Scenario: A subcommand without a description

- **WHEN** a matching subcommand has no description
- **THEN** its label is its name alone

### Requirement: The interactive terminal UI is detected by run mode

The package SHALL export an `isInteractiveTui(ctx)` function that returns `true`
when `ctx.mode` is `tui` and `false` for every other run mode, including `rpc`,
where `ctx.hasUI` is also `true`.

#### Scenario: Interactive mode

- **WHEN** `isInteractiveTui` receives a context whose mode is `tui`
- **THEN** it returns `true`

#### Scenario: Any other mode

- **WHEN** `isInteractiveTui` receives a context whose mode is `print`, `json`,
  or `rpc`
- **THEN** it returns `false`
