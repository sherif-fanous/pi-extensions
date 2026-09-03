## Why

Extension notifications currently become durable lines in Pi's chat transcript, where frequent notices compete with the conversation and create visual clutter. A notification center can keep these notices visible long enough to be useful, preserve them for later review, and leave the transcript focused on the conversation.

## What Changes

- Add a publishable Pi extension package named `@sherif-fanous/pi-notification-center`.
- Capture extension notifications sent through Pi's shared `ctx.ui.notify` function after the extension activates, while leaving Pi's internal status, warning, and error paths unchanged.
- Replace captured transcript notices with non-capturing, top-right toast cards that stack downward and expire after a configurable timeout.
- Record captured notices with severity and timestamp in the current Pi session.
- Add a `/notifications` command that opens a scrollable session-history overlay with local date and time.
- Add global configuration for toast timeout, visible stack size, and width, with safe defaults when no configuration exists.
- Scaffold the package with its own repository, TypeScript, linting, formatting, testing, task-runner, documentation, changelog, and licensing configuration.

## Capabilities

### New Capabilities

- `notification-center`: Capture, display, configure, retain, and review extension-originated Pi notifications.

### Modified Capabilities

None.

## Impact

- Adds a new TypeScript Pi package and extension entry point.
- Uses Pi's extension command, session-entry, custom UI, theme, and TUI overlay APIs.
- Wraps the shared extension UI notification function, an intentional compatibility risk because Pi does not currently provide an official notification-interception hook.
- Adds development-only formatting, linting, type-checking, testing, packaging, and mise task configuration.
- Does not intercept Pi core messages, issue operating-system notifications, or modify Pi itself.
