## Context

See `proposal.md` for motivation and scope. `src/config.ts` currently defines fixed paths consumed by loading, writing, and the write-target labels in `src/command.ts`. Reads distinguish missing files from malformed JSON and propagate other I/O errors. Writes reread the target, preserve unrelated settings, and refuse malformed JSON objects.

## Goals / Non-Goals

### Goals

- Keep one scope-local selection rule shared by reads, writes, and displayed destinations.
- Preserve existing validation, data-preservation, and explicit reload behavior.
- Support migration between operations without caching filesystem selection.

### Non-goals

- Automatic migration, merging files within a scope, or removing legacy support.
- A new storage abstraction, dependency, filesystem watcher, or settings schema.
- Changing write durability or guaranteeing consistency with concurrent external file moves.
- Recreating or editing `HANDOFF.md`.

## Decisions

### Select by presence, not valid contents

For each scope, prefer `theme-sync/settings.json` relative to its Pi directory. Only a missing preferred path permits trying `theme-sync.json`. If both are missing, the preferred path is the save destination and reads use existing defaults and cross-scope precedence.

Extend the existing small file-reading/path helpers in `src/config.ts` so missing-file state is distinguishable from malformed content. Do not infer absence from a missing parsed config value. Propagate non-missing I/O errors rather than treating them as legacy fallback. Keep malformed-content warnings and save refusal intact.

Selecting whichever file parses successfully would hide broken preferred settings. Merging both would make migration depend on stale values in a deprecated file.

### Share selection and resolve it afresh

Keep path candidates and selection in `src/config.ts`. Derive both global candidates from `getAgentDir()`; never search the default home directory in addition to an overridden agent directory. Resolve each scope independently on every load and save. Resolve displayed write targets when opening the write-target view rather than rendering the existing fixed constants.

A module-level selection cache would become stale after manual migration. Separate UI-specific fallback logic would risk showing a different destination from persistence.

### Continue writing the selected legacy file

When only the legacy file exists, reread and update it using the existing write behavior. When the preferred file exists, update only it. When neither exists, create the preferred parent directory and file with the existing write helper. Preserve unrelated keys and reject malformed selected files.

Always writing the new file would implicitly migrate settings and require copying the complete legacy object. Keeping saves in the selected file avoids that additional behavior and preserves compatibility.

### Keep migration explicit and quiet

Document preferred paths, missing-only fallback, legacy saves, and manual migration in `README.md`. Mark legacy paths deprecated without a removal date. Do not introduce recurring runtime deprecation warnings. Existing malformed-file warnings and I/O error handling remain applicable.

## Risks / Trade-offs

- A preferred file can intentionally mask legacy settings, even when it is `{}`. Mitigation: document that selection does not merge the two files and test this case.
- Users can remain on legacy paths indefinitely. Mitigation: provide migration instructions without forcing migration during a settings edit.
- External changes between displaying a destination and saving can change the selected path. Mitigation: resolve again at save time; refresh labels when reopening the write-target view. Concurrent external filesystem mutation is not transactionally supported.
- Writes remain non-atomic. Mitigation: retain the existing single-writer behavior and do not broaden storage formats or durability scope.

## Migration Plan

1. Ship preferred-path support and legacy fallback together, with compatibility tests.
2. Update README examples to the preferred paths and explain that legacy files remain supported and writable.
3. For manual migration, create the scope's `theme-sync` directory and move its `theme-sync.json` to `theme-sync/settings.json` only after checking that the destination does not already exist. If both exist, reconcile them manually; never blindly overwrite the preferred file. Run `/reload` to apply the selected settings.
4. For rollback to a release that only reads legacy paths, move the selected settings back to `theme-sync.json`, resolving any existing legacy file before overwriting it, then run `/reload`.
