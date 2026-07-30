## ADDED Requirements

### Requirement: Theme sync status overlay preserves alignment when text wraps

The extension SHALL render status overlay text that exceeds the available
overlay width with a hanging indent, so that continuation lines align under the
text column of their first line rather than at column 0.

#### Scenario: Wrapped warning aligns under its bullet

- **WHEN** the status overlay renders a warning whose bulleted line is wider than the available overlay width
- **THEN** each continuation line is indented to align under the text following the bullet marker

#### Scenario: Wrapped status value aligns under its value column

- **WHEN** the status overlay renders a label/value row whose value is wider than the available overlay width
- **THEN** each continuation line is indented to align under the value column, leaving the label column of continuation lines blank

#### Scenario: Wrapping adapts to the rendered width

- **WHEN** the status overlay is rendered at a width narrower than its preferred width
- **THEN** wrapping and hanging indentation are computed for the actual rendered width, and no content is truncated or lost

#### Scenario: Short lines are unchanged

- **WHEN** the status overlay renders text that fits within the available overlay width
- **THEN** the text is rendered on a single line with no added indentation
