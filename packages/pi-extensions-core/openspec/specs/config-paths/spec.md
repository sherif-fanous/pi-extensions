# config-paths Specification

## Purpose

Give Pi extensions one location for their configuration files in Pi's agent
directory and in a project, so every extension resolves the same layout and
moves with Pi's own agent directory override.

## Requirements

### Requirement: Configuration files live in Pi's agent directory and the project

A config handle's `path(ctx, scope)` SHALL return
`<agentDir>/<extension>/config.json` for `user`, where `<agentDir>` is Pi's
`getAgentDir()`, and `<cwd>/<CONFIG_DIR_NAME>/<extension>/config.json` for
`project`, where `CONFIG_DIR_NAME` is Pi's project configuration directory name.
No operation SHALL accept another agent directory: `PI_CODING_AGENT_DIR`, which
`getAgentDir()` honors, is the only way to move it.

#### Scenario: Paths in each scope

- **WHEN** a handle for the extension `theme-sync` resolves both scopes
- **THEN** it returns `<agentDir>/theme-sync/config.json` for `user` and
  `<cwd>/.pi/theme-sync/config.json` for `project`

#### Scenario: The agent directory override

- **WHEN** `PI_CODING_AGENT_DIR` names a directory
- **THEN** the user path is under that directory
