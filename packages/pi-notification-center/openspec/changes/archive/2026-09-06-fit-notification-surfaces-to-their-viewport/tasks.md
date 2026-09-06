## 1. Invert the split-frame width contract

- [x] 1.1 Change `renderSplitFrame` in `src/ui/frame.ts` to take the total width and derive the two pane widths from it, instead of taking pane widths and deriving the total. Verify by type-check: every caller that still passes pane widths fails to compile.
- [x] 1.2 Add a way for the frame module to answer "this width cannot hold two legible panes", returning nothing rather than clamping the width upward. Verify with a test that a width below the minimum yields no layout, and a width at the minimum yields one.
- [x] 1.3 Move the frame's own chrome into the module that draws it: the columns the borders, paddings, and divider occupy, and the rows the frame adds around its content. Verify by grep that no number matching that chrome is written anywhere in `src/ui/history-view.ts`.
- [x] 1.4 Update the `frame.ts` module JSDoc to state the new contract, including who decides a terminal is too small. Verify by reading it against the code: the stated contract and the signatures agree.
- [x] 1.5 Rewrite the assertions in `tests/frame.test.ts` that pinned the old arithmetic, namely the total width and the emitted row count. Write each one against the contract in the module JSDoc, not against the behavior you observe. Verify `mise run check` passes and that no expected number was changed without the new contract justifying it.
- [x] 1.6 Mutation check: change the frame's chrome by one column and confirm a test fails that names the width, not only a downstream test. Restore and re-run the gate.

## 2. Extract the browser layout into a pure function

- [x] 2.1 Add a pure layout function that takes the entries, the browser state (selection index and detail offset), and a viewport (width and terminal height), and returns the rows to draw plus the page height and the clamped detail offset. Verify it is exported and has no reference to the component.
- [x] 2.2 Move the pane-width, row-budget, detail-slicing, list-windowing, and frame-assembly work out of `HistoryViewComponent.render` and into that function. `render` becomes a router: call the function, store what the key handler needs, return the rows. Verify `render` no longer computes any width.
- [x] 2.3 Make the page height available to `handleInput` without depending on a previous render. Verify with a test that a page-down delivered before the first render pages by the real page height, which fails before this task.
- [x] 2.4 Rewrite the assertions in `tests/history-view.test.ts` that recover pane content by splitting rendered lines on the divider character, so they assert on the layout function's return value instead. Verify with a test that a notification whose message contains the divider character is still read correctly, which the old idiom cannot do.
- [x] 2.5 Confirm every other test in `tests/history-view.test.ts` passes unchanged, except the narrow-terminal assertion handled in task 3.3. Verify by diffing the test file: any other edit means behavior moved and is a signal to stop and report.

## 3. Answer the narrow terminal

- [x] 3.1 Add one exported predicate that decides whether a terminal is wide enough for the browser, built from the frame's minimum width. Verify with a test covering one column below the minimum, the minimum itself, and one column above.
- [x] 3.2 Give the history overlay a `visible` predicate driven by that function, the same hook the toast surface uses. Verify with a test that the overlay options carry it, and that it returns false below the minimum.
- [x] 3.3 Make the browser draw nothing rather than a cut-off frame when its width is below the minimum, and truncate its rows to the width it was given as the final step. Document the truncation as defense against a future frame change rather than as the mechanism that makes the width correct. Rewrite the existing test that asserts a 20-column render returns lines wider than 20, since it pins the defect as correct.
- [x] 3.4 In `src/commands/notifications.ts`, check the width before opening the overlay and send the existing count message as a plain notification when the terminal is too narrow. Read the width through an injected reader that defaults to the process's terminal columns, matching how `terminalHeight` is already injected. Verify with tests for the populated and the empty case.
- [x] 3.5 Make the width check fail open when the terminal width is unavailable, so the browser opens and the overlay predicate decides. Verify with a test that an undefined width still opens the browser.
- [x] 3.6 Mutation check: invert the predicate and confirm tests fail on both sides, the too-narrow case and the wide-enough case. Restore and re-run the gate.

## 4. Land the two deferred geometry items

- [x] 4.1 Replace the hardcoded card chrome in the browser's empty state with the named constant, now that both surfaces can reach it from the frame module. Verify the rendered empty state is byte-identical before and after, since this is a rename of a number.
- [x] 4.2 State the toast horizontal margin once, so the stack and the surface stop disagreeing about whether it is one column or two. Verify with a test that the value the surface asks Pi for and the value the stack reserves are the same, and confirm in a live terminal that the corner placement of a short toast is unchanged.
- [x] 4.3 Keep tasks 4.1 and 4.2 as their own commits, separate from the frame and layout work, so the geometry change is reviewable on its own. Verify with `git log --oneline`.

## 5. Verify what the suite cannot see

- [x] 5.1 Run `mise run check` and confirm format-check, type-check, both linters, and the tests all pass.
- [ ] 5.2 SKIPPED by Sherif, 2026-09-06. Covered by tests on both sides of the width predicate, and a terminal under 39 columns is not one anyone reads a two-pane browser in. Left unchecked rather than ticked, because it was not done. Live check the narrow terminal: run `pi -e . -e ./examples/emitter.ts`, open `/notifications`, and resize below the minimum width. Confirm the browser draws nothing rather than a cut frame, reappears when widened, and still closes on the cancel key.
- [ ] 5.3 SKIPPED by Sherif, 2026-09-06, for the same reason as 5.2. Live check the command gate: start on a terminal already below the minimum width, run `/notifications`, and confirm a plain notification reports the count instead of an overlay opening. Repeat with no notifications captured and confirm the empty-state message.
- [x] 5.4 Live check that the toast surface is unchanged: run `/emit`, and confirm a short card still sits in the top-right corner. This is the scenario added to the spec, and no automated test can see it.
- [x] 5.5 Re-run every mutation from tasks 1.6 and 3.6 yourself rather than accepting a report, per this cycle's verification discipline.

## 6. Close out

- [x] 6.1 Record issues 6 and 7 as done in the review cycle's working notes, with what the live checks showed and the fact that the deferred card chrome and toast margin are now landed. Verify no open item is left.
- [x] 6.2 Write the changelog entry this change owes, in the user's language and naming no internal mechanism, and carry it into the pull request so it survives the working notes. Verify it reads as something a user could act on.
- [x] 6.3 Run `openspec validate --changes "fit-notification-surfaces-to-their-viewport" --strict` and confirm it passes before archiving.
