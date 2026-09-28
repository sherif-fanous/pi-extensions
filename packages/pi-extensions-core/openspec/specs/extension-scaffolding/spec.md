# extension-scaffolding Specification

## Purpose

Give Pi extension entry points one way to report command and event handler
failures, show warnings, answer usage mistakes, complete fixed subcommands, and
detect the interactive terminal UI or warn when a command needs it, so every
extension words its failures and warnings alike and none redefines the same
wrappers.

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

### Requirement: Warnings from one operation form one notification

The package SHALL export a `notifyWarnings(ctx, extensionName, warnings)`
function. When `warnings` is empty, it SHALL NOT notify. Otherwise it SHALL
notify exactly once, at `warning` severity, with the text
`<extensionName>: <n> warning` when `<n>` is 1 and
`<extensionName>: <n> warnings` otherwise, followed by one line `- <warning>`
per warning in the order given. Like the guards, it SHALL notify on a
best-effort basis: when the context's `notify` throws, `notifyWarnings` SHALL
return without throwing.

#### Scenario: No warnings

- **WHEN** `notifyWarnings` receives an empty list
- **THEN** it does not notify

#### Scenario: One warning

- **WHEN** `notifyWarnings` receives the extension name `Theme Sync` and the
  single warning `Configuration is not valid JSON.`
- **THEN** it notifies `Theme Sync: 1 warning` and
  `- Configuration is not valid JSON.` on separate lines at `warning` severity

#### Scenario: Several warnings

- **WHEN** `notifyWarnings` receives three warnings
- **THEN** it notifies once, under the heading `<extensionName>: 3 warnings`,
  with one `- <warning>` line per warning in the order given

#### Scenario: A stale context

- **WHEN** `notifyWarnings` receives at least one warning and the context's
  `notify` throws
- **THEN** `notifyWarnings` returns without throwing

### Requirement: Usage mistakes get one standard warning

The package SHALL export a
`notifyUsageWarning(ctx, extensionName, argument, forms)` function, where
`forms` is a non-empty list of the ways to run the command as the user types
them. It SHALL show, through `notifyWarnings` under `extensionName`, the single
warning `Unknown subcommand "<argument>". Try <alternatives>.`, where
`<argument>` is `argument` with surrounding whitespace removed and
`<alternatives>` is the forms in order: the one form alone, two forms joined by
the word "or", or three or more forms separated by commas with "or" before the
last, as in `a, b, or c`.

#### Scenario: A command without arguments

- **WHEN** `notifyUsageWarning` receives the extension name
  `Notification Center`, the argument `foo`, and the single form
  `/notifications`
- **THEN** it notifies `Notification Center: 1 warning` and
  `- Unknown subcommand "foo". Try /notifications.` on separate lines at
  `warning` severity

#### Scenario: Two forms

- **WHEN** `notifyUsageWarning` receives the argument `foo` and the forms
  `/theme-sync` and `/theme-sync status`
- **THEN** the warning reads
  `Unknown subcommand "foo". Try /theme-sync or /theme-sync status.`

#### Scenario: Three or more forms

- **WHEN** `notifyUsageWarning` receives the argument `foo`, surrounded by
  spaces, and the forms `/rtk`, `/rtk enable`, `/rtk disable`, and `/rtk status`
- **THEN** the warning reads
  `Unknown subcommand "foo". Try /rtk, /rtk enable, /rtk disable, or /rtk status.`

### Requirement: Fixed subcommands complete on the first word

The package SHALL export a `subcommandCompletions(subcommands)` function that
takes a list of `{ name, description? }` entries and returns a
`getArgumentCompletions` function. That function SHALL ignore leading whitespace
in the argument prefix, return `null` when the rest contains a space, and
otherwise return every subcommand whose name starts with the prefix as
`{ value: name, label: name }`, plus its `description` when it has one, in list
order, or `null` when none match.

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

### Requirement: Subcommand descriptions use Pi's description column

Each completion `subcommandCompletions` returns SHALL use the subcommand name
alone as its label, and SHALL carry the entry's description in the completion's
`description` field, which Pi shows as a separate dimmed column. A completion
for an entry without a description SHALL have no `description` field.

#### Scenario: A subcommand with a description

- **WHEN** a matching subcommand named `status` has the description
  `Show status`
- **THEN** its completion is
  `{ value: "status", label: "status", description: "Show status" }`

#### Scenario: A subcommand without a description

- **WHEN** a matching subcommand has no description
- **THEN** its label is its name alone
- **AND** the completion has no `description` field

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

### Requirement: Overlay commands warn outside the interactive terminal UI

The package SHALL export a `requireInteractiveTui(ctx, extensionName, command)`
function for commands that open a terminal overlay. When `isInteractiveTui(ctx)`
is `true`, it SHALL return `true` and SHALL NOT notify. Otherwise it SHALL show,
through `notifyWarnings` under `extensionName`, the single warning
`<command> needs Pi's interactive terminal UI. Run it from the TUI.`, and SHALL
return `false`.

#### Scenario: Interactive mode

- **WHEN** `requireInteractiveTui` receives a context whose mode is `tui`
- **THEN** it returns `true`
- **AND** it does not notify

#### Scenario: Any other mode

- **WHEN** `requireInteractiveTui` receives a context whose mode is `print`,
  `json`, or `rpc`, the extension name `Session Slice`, and the command `/slice`
- **THEN** it notifies `Session Slice: 1 warning` and
  `- /slice needs Pi's interactive terminal UI. Run it from the TUI.` on
  separate lines at `warning` severity
- **AND** it returns `false`
