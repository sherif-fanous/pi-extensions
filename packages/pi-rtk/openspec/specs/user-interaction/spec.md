# User Interaction Specification

## Purpose

Define the user-visible behavior of `pi-rtk`, including transparency during normal operation and resilience when shell optimization fails.

## Requirements

### Requirement: Non-Disruptive Fallback

Failures in the shell optimization layer MUST NOT interrupt normal shell tool usage.

#### Scenario: Optimization failure

- GIVEN a command submitted to the `bash` tool
- WHEN shell optimization fails before command execution
- THEN the command MUST still execute using normal shell behavior
- AND the optimization failure MUST NOT crash, block, or disable the host agent

### Requirement: Transparent Operation

The optimization layer MUST remain invisible during normal use.

#### Scenario: Standard command execution

- GIVEN normal shell command execution through the `bash` tool
- THEN the system MUST NOT add user-facing notifications solely to report optimization activity
- AND the user experience MUST remain consistent whether optimization is applied or bypassed

### Requirement: Graceful Operation Without `rtk`

The system MUST continue to provide normal shell execution when `rtk` is unavailable.

#### Scenario: `rtk` is unavailable

- GIVEN `rtk` is not installed, not resolvable on `PATH`, or otherwise unavailable to the optimization layer
- WHEN a command is submitted to the `bash` tool
- THEN the system MUST execute the original command unchanged
- AND the user MUST retain normal shell tool functionality

### Requirement: Respect For User Context Visibility Choice

The system MUST preserve the semantic distinction between Pi's context-visible and context-excluded user shell command modes.

#### Scenario: User selects context-visible shell mode

- **WHEN** a user executes a shell command using Pi's `!<cmd>` syntax while `pi-rtk` is loaded
- **THEN** the command MUST remain eligible for optimization behavior
- **AND** successful optimization MUST preserve the normal experience of running a user shell command in Pi

#### Scenario: User selects context-excluded shell mode

- **WHEN** a user executes a shell command using Pi's `!!<cmd>` syntax while `pi-rtk` is loaded
- **THEN** the command MUST bypass `pi-rtk` optimization behavior
- **AND** the user's choice to exclude output from model context MUST be respected

### Requirement: Transparent User Bash Optimization

The system MUST keep user bash optimization non-disruptive during normal operation.

#### Scenario: Optimization succeeds for a user shell command

- **WHEN** a supported shell command executed through Pi's `!<cmd>` syntax is optimized successfully
- **THEN** the command MUST complete without requiring additional user interaction solely for optimization reporting
- **AND** the user experience MUST remain consistent with normal shell execution
