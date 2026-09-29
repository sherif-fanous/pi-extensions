# Notification Center

Notification Center shows Pi notifications as toasts and keeps a browsable
history of the session's notifications. The family rules are in the root
`AGENTS.md` and `docs/`; these notes apply only to this package.

- Wrap `ctx.ui.notify` in exactly one place, the intercepting function in
  `src/capture.ts`, and keep it synchronous so an emitting extension never
  awaits UI work. Never widen a claim about what it captures: Pi's own
  rendering, calls made before the extension activates, project-trust prompts,
  custom transcript messages, and separately created UI contexts are out of
  reach.
- Never let the toast surface take focus or join the overlay stack late; either
  one breaks other extensions' UI. Create it once at session start, on the TUI
  that core's `getLiveTui` returns, and hide it; never remove and re-push it.
- Measure terminal layout with the `pi-tui` width helpers, never
  `String.length`, because ANSI escapes and wide characters break character
  counts. Draw nothing rather than a broken frame when the terminal is too
  small.
- Pi session entries are the only durable history store; module memory is never
  authoritative.
- Read `config.json` only through the core config handle `src/config.ts`
  defines. The session in `src/session.ts` loads it at each start and shows its
  outcome through the capture-backed context, so the messages travel the capture
  path. Keep session state there, not in `src/index.ts`.
- Keep pure formatting apart from rendering: an exported function returns
  `string[]` for a given viewport and state, and a thin component holds the
  state and routes those lines. Tests assert on the function.
- After changing the toast surface or the capture wrapper, run the manual TUI
  check in the `examples/emitter.ts` module JSDoc.
