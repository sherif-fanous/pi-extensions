# pi-extensions

Sherif Fanous's extensions for [Pi](https://github.com/earendil-works/pi), the
coding agent, and the library they share, in one pnpm workspace.

## Packages

| Package                                                   | Description                                                                                | npm                                                                                                          |
| :-------------------------------------------------------- | :----------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| [pi-rtk](packages/pi-rtk)                                 | Routes shell commands through rtk to reduce LLM token usage                                | [@sherif-fanous/pi-rtk](https://www.npmjs.com/package/@sherif-fanous/pi-rtk)                                 |
| [pi-theme-sync](packages/pi-theme-sync)                   | Switches Pi's theme to match your terminal or system appearance                            | [@sherif-fanous/pi-theme-sync](https://www.npmjs.com/package/@sherif-fanous/pi-theme-sync)                   |
| [pi-presets-plus](packages/pi-presets-plus)               | Bundles a model, thinking level, tools, and system prompt into switchable presets          | [@sherif-fanous/pi-presets-plus](https://www.npmjs.com/package/@sherif-fanous/pi-presets-plus)               |
| [pi-notification-center](packages/pi-notification-center) | Shows notifications as toasts and keeps a browsable session history                        | [@sherif-fanous/pi-notification-center](https://www.npmjs.com/package/@sherif-fanous/pi-notification-center) |
| [pi-session-slice](packages/pi-session-slice)             | Starts a new session from a chosen range of the current one                                | [@sherif-fanous/pi-session-slice](https://www.npmjs.com/package/@sherif-fanous/pi-session-slice)             |
| [pi-extensions-core](packages/pi-extensions-core)         | Shared helpers for errors, config files, reports, and TUI surfaces that the extensions use | [@sherif-fanous/pi-extensions-core](https://www.npmjs.com/package/@sherif-fanous/pi-extensions-core)         |

Install an extension with `pi install npm:@sherif-fanous/<package>`, for example
`pi install npm:@sherif-fanous/pi-theme-sync`. Each package's README has the
details.

Two private packages support the others and are never published:
[pi-extensions-testing](packages/pi-extensions-testing), the test doubles, and
`packages/pi-extensions-release`, the release tooling.

## Development

[mise](https://mise.jdx.dev/) provisions Node and pnpm and runs every task.

```shell
mise install
pnpm install
```

| Task                  | Where           | What it does                                                    |
| :-------------------- | :-------------- | :-------------------------------------------------------------- |
| `mise run check`      | root            | Checks the root files' formatting, then every package's `check` |
| `mise run check`      | `packages/<p>`  | Checks formatting, types, and lint, and runs the tests          |
| `mise run format`     | root or package | Formats the files                                               |
| `mise run lint-fix`   | `packages/<p>`  | Fixes most lint violations                                      |
| `mise run test-watch` | `packages/<p>`  | Runs the tests in watch mode                                    |
| `mise run changeset`  | root            | Records a user-visible change for the next release              |

Run `pi -e packages/<p>` to try a package from the checkout.
[AGENTS.md](AGENTS.md) is the family style guide for code, text, configuration,
and TUI.

## Releasing

Changesets versions and publishes the packages. The steps are in the
[Releasing](AGENTS.md#releasing) section of `AGENTS.md`.

## License

Each published package is licensed under MIT; see its `LICENSE` file.
