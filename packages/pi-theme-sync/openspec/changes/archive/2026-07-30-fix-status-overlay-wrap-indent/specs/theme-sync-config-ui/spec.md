## ADDED Requirements

### Requirement: Theme sync config overlay preserves alignment when messages wrap

The extension SHALL render the config overlay's inline message line with a
hanging indent when it exceeds the available overlay width, so that continuation
lines align under the text column of the first line rather than at column 0.

#### Scenario: Wrapped inline message keeps its indent

- **WHEN** the config overlay shows an inline message (validation error, save result, or warning) that is wider than the available overlay width
- **THEN** each continuation line is indented to align under the start of the message text

#### Scenario: Message wrapping preserves severity styling

- **WHEN** a wrapped inline message is rendered
- **THEN** every rendered line carries the message's severity styling and the full message text remains readable
