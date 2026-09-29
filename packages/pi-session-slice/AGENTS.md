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
  and the builder slices the raw branch between two ids. The builder takes ids;
  pickers may return their candidate view, never session entries.
- `src/slice.ts` is the only module that knows the JSONL format and the
  supported session version. `src/commands/slice.ts` asks it through
  `unsupportedSourceReason` once, before showing any picker, and refuses when it
  gives a reason.
- Picker titles are `Slice: Start at Message` and `Slice: End Before Message`.
  Picker rows carry no terminal punctuation (`Keep everything to the end`,
  `Message 3 of 12 · 2h ago`).
