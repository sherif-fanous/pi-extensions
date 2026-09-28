# text-formatting Specification

## Purpose

Give Pi extensions one way to write a count with its noun, so no user-facing
text reads `1 entries` or `setting(s)`.

## Requirements

### Requirement: Counts agree with their noun

The package SHALL export a `pluralize(count, singular, plural?)` function that
returns `<count> <singular>` when `count` is 1 and `<count> <plural>` otherwise.
`plural` SHALL default to `singular` followed by `s`.

#### Scenario: One item

- **WHEN** `pluralize` receives the count 1 and the noun `preset`
- **THEN** it returns `1 preset`

#### Scenario: Zero or several items

- **WHEN** `pluralize` receives the count 0 or 3 and the noun `preset`
- **THEN** it returns `0 presets` or `3 presets`

#### Scenario: An irregular noun

- **WHEN** `pluralize` receives the count 3, the noun `entry`, and the plural
  `entries`
- **THEN** it returns `3 entries`
