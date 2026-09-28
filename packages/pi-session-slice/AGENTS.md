# Session Slice

Session Slice starts a new Pi session from a chosen range of the current one.
The family rules are in the root `AGENTS.md` and `docs/`; these notes apply only
to this package.

- Never open the source session file for writing. Session Slice reads the
  current session through `ctx.sessionManager` and writes exactly one new file.
- Never transform a copied entry. The only field a slice may touch is
  `parentId`, and only where re-chaining the tree requires it; anything the
  slice adds is a new entry. Don't normalize timestamps, strip provider fields,
  or reorder content.
- Boundaries are entry ids. The pickers list candidates from the context view,
  and the builder slices the raw branch between two ids. Pass ids between them,
  never indexes or copies of entries.
- `src/slice.ts` is the only module that knows the JSONL format, and it owns
  `SUPPORTED_SESSION_VERSION`. `src/commands/slice.ts` checks the source header
  against it once, before showing any picker, and refuses on a mismatch.
- Picker titles are `Slice: Start at Message` and `Slice: End Before Message`.
  Picker rows carry no terminal punctuation (`Keep everything to the end`,
  `Message 3 of 12 · 2h ago`).
