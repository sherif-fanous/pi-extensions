## Context

See `proposal.md` for motivation and `specs/notification-center/spec.md` for the behavior being added.

Three facts about the current code shape the approach.

`renderSplitFrame` takes two pane widths and derives the total width from them. The browser therefore has to run that arithmetic backwards to decide how wide each pane may be, and it does so in three separate places: the content width, the browser's own minimum width, and the row count the frame occupies. Nothing ties those three numbers to the frame that owns them.

`HistoryViewComponent.render` derives the whole layout inline and writes two fields while doing it. One of them, the page height, is read by the key handler, so a page key pressed before the first render pages by a seed value.

The command has no way to learn the terminal width before it opens the overlay. `ExtensionCommandContext` exposes `ui.custom` and `ui.notify`, and the `tui` handle arrives only inside the component factory, after the overlay exists. Pi does offer `OverlayOptions.visible(termWidth, termHeight)`, called every render cycle, which is the hook the toast surface already uses through `canRenderToasts`.

## Goals / Non-Goals

**Goals:**

- One module owns the split frame's geometry, so the browser asks for a layout instead of reconstructing one.
- The browser's layout is a pure function of its inputs, testable without constructing a component or parsing box-drawing characters.
- A terminal too narrow for the browser produces an answer, not a broken frame.
- The two surfaces answer the "too small" question the same way.

**Non-Goals:**

- No new configuration setting. The minimum width stays derived from the minimum pane width, not exposed.
- No change to how the browser is sized in rows. The height rules already work and their scenarios stay as they are.
- No second browser layout for narrow terminals. That was considered and rejected below.
- No change to toast card sizing. Only the margin, which is currently stated twice.

## Decisions

### A narrow terminal gets a notification, not a smaller browser

Rejected: a single-pane browser at the real width. It is a second reading surface with its own layout, its own tests, and its own scroll behavior, built for a terminal where two panes were never going to fit. The browser's value is a list beside a detail; one pane is a different product.

Rejected: drawing the two-pane frame truncated. `AGENTS.md` rules it out, and it is the current defect.

Chosen: no overlay, and `/notifications` reports the count as a plain notification. The command already builds that exact message for RPC, JSON, and print mode, so the narrow terminal reuses a path that exists and is covered. A passive toast can simply not appear because nobody asked for it. A typed command is owed a reply.

### The width gate is checked twice, in two places, for two reasons

The command cannot read the terminal before opening the overlay, so one check cannot serve both cases.

At invocation, the command checks the width and chooses between opening the overlay and sending the notification. The width comes from an injected reader defaulting to the process's own terminal columns, matching how `terminalHeight` is already injected for tests. When that value is unavailable the check passes, so the browser opens and the second gate handles it. Failing open matters: a wrong "too narrow" answer suppresses a browser that would have worked, which is worse than a frame that is briefly empty.

While open, the overlay carries a `visible` predicate, which Pi calls every render cycle with the current terminal size. This is the same mechanism the toast surface uses, and it is what makes the resize scenario work without a resize listener.

The predicate is one exported function used by both call sites, so the two gates cannot disagree.

### `renderSplitFrame` takes the total width and derives the pane widths

This is the inversion the thermo-nuclear review called its headline move, and it is what makes the rest fall out.

Once the frame owns the arithmetic, the browser stops re-deriving the chrome in three places, the frame's minimum width is computed by the module that knows the chrome, and fitting the viewport becomes expressible: the caller passes the width it was given and cannot get back something wider.

The frame also answers "too narrow" by returning nothing rather than by clamping upward. Clamping upward is how the current defect happens: the browser raises the width to its own minimum and then draws to that raised number.

Alternative considered: keep the contract and export the chrome as constants, which the browser imports instead of hardcoding. It removes the duplication but not the inversion, so the browser still cannot promise to fit. Rejected as half the change for most of the risk.

### Layout derivation becomes a pure function; the component keeps state

The component keeps the selection index, the detail scroll offset, the closed flag, and key handling. Everything else moves into a function that takes the entries, that state, and a viewport, and returns the rows to draw plus the numbers the key handler needs, including the page height.

This is the convention the toast surface already follows and `AGENTS.md` states. Two things follow from it. The page height stops being a side effect of rendering, which removes the stale first-page bug. And the tests can assert on returned values instead of recovering pane content by splitting rendered lines on the divider character, which breaks on any message containing that character.

### Truncation stays as a final step even though the frame now guarantees the width

Belt and braces, with a caveat learned in this cycle: a no-op guard that looks like a real one is worse than none. So the truncation is documented as defense against a future frame change, not as the mechanism that makes the width correct. If it ever becomes load-bearing, that is a defect in the frame.

## Risks / Trade-offs

**`tests/frame.test.ts` is expected to fail, and the temptation is to make it pass.** It deliberately pins the two facts this change inverts: the total width is `left.width + right.width + 7`, and the output is `rows + 6` lines. → Rewrite each failing assertion against the contract in the module JSDoc, the way issue 10 wrote them in the first place. A failure there is the safety net working. Do not adjust an expected number until the new contract says what it should be.

**No automated test in this suite can see a placement or overflow defect.** Tests read returned strings and never model the column those strings are composited at. That is how the toast placement regression shipped. → The live terminal check is part of this change, not optional. Resize below the minimum with the browser open, and confirm the corner placement of a short toast is unchanged.

**The command's width reader and the overlay's own width are different numbers.** The overlay takes a percentage of the terminal, so the command's gate is an approximation of what the component will receive. → The gate is deliberately generous and fails open. The overlay predicate is the accurate one, and it runs every cycle.

**Extracting the layout is the largest single edit in this cycle.** Behavior can drift silently. → Every existing test in `tests/history-view.test.ts` must still pass, except the narrow-terminal assertion that pins the defect and the divider-splitting idiom, both named in the proposal. A test that needs changing for any other reason means behavior moved, and that is a signal to stop.

**Two deferred items land here, which widens the diff.** The browser's hardcoded card chrome and the toast margin. → Both are geometry and both were deferred to this change on purpose. Keep them as separate commits so the geometry change is reviewable on its own.

## Migration Plan

No migration. No configuration setting, persisted entry, or public package export changes. The extension reads nothing it did not read before.

Rollback is reverting the commits. There is no state written by this change to unwind.

## Open Questions

None that can be deferred. The narrow-terminal behavior, the gate's location, and the frame contract were all settled above because each one changes the specs, the approach, or the task breakdown.
