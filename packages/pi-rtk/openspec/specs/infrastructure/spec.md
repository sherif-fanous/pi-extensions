# Infrastructure Specification

## Purpose

Define the integration requirements for `pi-rtk` as a Pi Package and Extension.

## Requirements

### Requirement: Tool Overriding

The system MUST register a custom `bash` tool that replaces the default Pi `bash` tool.

#### Scenario: Extension activation

- GIVEN the `pi-rtk` extension is loaded
- WHEN the agent requests the `bash` tool
- THEN the optimized version provided by `pi-rtk` MUST be used instead of the built-in one

### Requirement: Package Discovery

The system MUST be discoverable and installable as a standard Pi Package.

#### Scenario: `package.json` Manifest

- GIVEN a standard Pi installation
- THEN the `package.json` MUST contain the `pi-package` keyword
- AND the `pi` manifest MUST point to the extension entry point (`index.ts`)

### Requirement: SDK Compatibility

The extension MUST maintain compatibility with the `@mariozechner/pi-coding-agent` SDK.

#### Scenario: Peer Dependencies

- GIVEN the package is installed in a Pi environment
- THEN it MUST treat the Pi SDK as a peer dependency to avoid module duplication
