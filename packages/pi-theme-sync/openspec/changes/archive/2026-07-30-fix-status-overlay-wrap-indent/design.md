## Context

See `proposal.md` — Why. Relevant current state:

- The `/theme-sync` overlay builds its body in `rebuild()` (`src/command.ts`)
  from `pi-tui` components, then renders through
  `ctx.ui.custom(...)` with `overlayOptions.width: 78`.
- `Text` is the only text component in use. Its `render(width)` calls
  `wrapTextWithAnsi(text, width - paddingX * 2)` and applies a uniform left
  margin of `paddingX`. It has no concept of a per-line hanging indent, so
  continuation lines start at the same column as first lines.
- `rebuild()` runs outside `render(width)` and therefore does not know the
  rendered width. Overlay width is nominally 78 but the host may clamp it on a
  narrow terminal.
- `wrapTextWithAnsi(text, width)` is exported from `@earendil-works/pi-tui` and
  is ANSI-aware: it tracks active SGR state across wrapped lines and breaks
  over-long single tokens character by character.
- Per `AGENTS.md`, the Status overlay is one of two non-list modes that render
  inline rather than through `buildListOverlay`.

## Goals / Non-Goals

**Goals:**

- One reusable, width-aware rendering primitive that both the Status overlay and
  the shared list-overlay message line consume, so the same bug is not fixed
  three times.
- Correct behavior at any rendered width, including widths narrower than 78.
- No change to existing warning or message strings.

**Non-Goals:**

- Reworking the Status overlay into `buildListOverlay`.
- Wrapping behavior for `SelectList` rows or the footer hint line.
- Auditing or rewording warning text; the trailing-period inconsistency between
  `AGENTS.md` and the strings in `src/config.ts` / `src/runtime.ts` is a separate
  concern.

## Decisions

### Decision 1: A custom `Component` that wraps at render time, not pre-wrapping in `rebuild()`

Implement a small component (working name `HangingText`) implementing `pi-tui`'s
`Component` interface, whose `render(width)` wraps its content and applies the
hanging indent using the width it is handed. `rebuild()` constructs it with
logical content only.

Alternatives considered:

- **Pre-wrap strings in `rebuild()` and keep using `Text`.** Rejected: the
  builder has no width. It would need to hardcode `78 - padding`, duplicating
  overlay geometry away from `overlayOptions` and producing wrong output whenever
  the host clamps the overlay on a narrow terminal.
- **Subclass or fork `Text`.** Rejected: its `render` already owns padding,
  caching, and background handling; a sibling component is smaller and does not
  depend on `Text` internals.

### Decision 2: Model the input as (prefix, body) pairs, not pre-indented strings

The component takes lines as a first-line prefix plus body text. Continuation
lines are indented by the prefix's visible width. This covers both call shapes
with one model:

- warnings — prefix `"  - "`, body the warning text;
- status rows — prefix `"Available Detectors: "` (already padded to the shared
  label column), body the value.

Alternative considered: detect the indent by regex from an already-formatted
string (`/^(\s*-\s+)/`, `/^\S.*?:\s+/`). Rejected: fragile, and it re-derives
structure the call site already has.

### Decision 3: Wrap plain text, then apply `theme.fg` per rendered line

Compute wrapping on unstyled text, then style each output line. `theme.fg` is
currently applied to the whole joined block before handing it to `Text`.

`wrapTextWithAnsi` is ANSI-aware and would likely survive pre-styled input, but
wrapping plain text keeps visible-width arithmetic for the indent trivially
correct and does not depend on that tracker's behavior. Reuse
`wrapTextWithAnsi` for the wrap itself rather than writing a word-break loop —
it already handles over-long tokens and matches `Text`'s wrapping semantics, so
the two components break lines identically.

### Decision 4: Scope includes both config message render sites

`AGENTS.md` says to keep Status-specific rendering in the Status branch; that
constraint is about mode layout, not about a shared leaf component. The message
line at `buildListOverlay` and the polling-interval editor's validation error
have the identical defect, so both route through the same component.
Warnings-only would knowingly leave instances of the same bug in place.

### Decision 5: Keep the component local to `src/command.ts` unless it needs a home

The component is small and has exactly one consumer file. Introduce it in
`src/command.ts` with its own module JSDoc-consistent doc comment. Extract to a
separate module only if a second file needs it.

## Risks / Trade-offs

- **Very narrow widths leave little room for the body after a long prefix**
  (e.g. the 21-column status label prefix) → clamp the effective body width to a
  minimum of 1 column, matching `Text`'s `Math.max(1, ...)` guard, so rendering
  degrades rather than looping or throwing.
- **Divergence from `Text`'s wrapping** if a hand-rolled wrap were used →
  mitigated by Decision 3: reuse `wrapTextWithAnsi`.
- **No test suite in the repo**, so regressions here are caught only by eye →
  mitigated by verifying at both the default width and a deliberately narrow
  terminal, with a temporarily injected long warning.
- **Caching**: `Text` memoizes on `(text, width)`. The new component will be
  rebuilt on every `rebuild()` anyway; skipping a cache keeps it simple at the
  cost of re-wrapping a handful of short lines per render. Acceptable.

## Migration Plan

Not applicable — cosmetic rendering change, no persisted state, no config or API
surface. Rollback is reverting the commit.
