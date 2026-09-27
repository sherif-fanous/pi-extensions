# config-paths Specification

## Purpose

Give Pi extensions one way to locate their configuration files in Pi's agent
directory and in a project, so every extension resolves the same layout without
rebuilding the paths.

## Requirements

### Requirement: Agent-directory file paths are resolved per extension

The package SHALL export an `extensionConfigPath({ extension, file, agentDir })`
function that returns `<agentDir>/<extension>/<file>`, where `agentDir` defaults
to Pi's `getAgentDir()`.

#### Scenario: An explicit agent directory

- **WHEN** `extensionConfigPath` receives an `agentDir`, an extension name, and
  a file name
- **THEN** it returns the three joined as one path

#### Scenario: No agent directory

- **WHEN** `extensionConfigPath` receives no `agentDir`
- **THEN** it resolves the path under the directory Pi's `getAgentDir()` returns

### Requirement: Project file paths are resolved per extension

The package SHALL export a `projectConfigPath({ cwd, extension, file })`
function that returns `<cwd>/<CONFIG_DIR_NAME>/<extension>/<file>`, where
`CONFIG_DIR_NAME` is Pi's project configuration directory name.

#### Scenario: A project directory

- **WHEN** `projectConfigPath` receives a project directory, an extension name,
  and a file name
- **THEN** it returns them joined with Pi's configuration directory name between
  the project directory and the extension name
