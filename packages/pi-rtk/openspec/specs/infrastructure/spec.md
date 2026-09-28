# infrastructure Specification

## Purpose

Define how RTK integrates with Pi: the `/rtk` command and the replacement `bash`
tool. The package shape it shares with the other extensions is in the
repository's `extension-packaging` spec.

## Requirements

### Requirement: /rtk slash command registration

The extension MUST register a `/rtk` slash command via Pi's `registerCommand`
API on load. The command MUST accept the subcommand arguments `enable`,
`disable`, and `status`, and MUST support a bare invocation with no arguments.

#### Scenario: Extension registers /rtk at load

- **WHEN** Pi loads the `pi-rtk` extension
- **THEN** `/rtk` MUST appear in Pi's slash command registry with a
  human-readable description
- **AND** invoking `/rtk` MUST route to the extension's handler

#### Scenario: Argument completion lists valid subcommands

- **WHEN** the user types `/rtk ` and triggers argument completion
- **THEN** Pi MUST offer `enable`, `disable`, and `status` as the available
  completions

#### Scenario: Unknown subcommand is rejected

- **WHEN** the user invokes `/rtk` with an argument that is not `enable`,
  `disable`, or `status`
- **THEN** the extension MUST surface a user-facing error message listing the
  valid subcommands
- **AND** the rewriting toggle state MUST NOT change

### Requirement: Bash tool integration

The system MUST provide a `bash` tool implementation that Pi uses when the
`pi-rtk` package is loaded.

#### Scenario: Extension activation

- **GIVEN** the `pi-rtk` extension is loaded by Pi
- **WHEN** the agent invokes the `bash` tool
- **THEN** Pi MUST use the `pi-rtk` `bash` tool implementation
- **AND** shell command execution MUST pass through that implementation

### Requirement: Local bash operations come from Pi

The extension MUST run shell commands through Pi's exported
`createLocalBashOperations()` helper and MUST NOT bundle a duplicate of Pi's
local bash operations. The supported Pi version is in the repository's
`extension-packaging` spec.

#### Scenario: Runtime loading on a supported Pi version

- **GIVEN** the package is installed in a Pi version that the
  `extension-packaging` spec supports
- **WHEN** Pi loads the package
- **THEN** the extension MUST load using Pi's exported
  `createLocalBashOperations()` helper
- **AND** the package MUST NOT require a bundled duplicate of Pi's local bash
  operations implementation
