# Theme Sync

Theme Sync switches Pi's theme to match the terminal or system appearance. The
family rules are in the root `AGENTS.md` and `docs/`; these notes apply only to
this package.

- Add a detector by writing its implementation, listing it in the registries in
  `src/detectors/index.ts`, and adding the matching `detectAppearance` switch
  arm. Nothing else should need to change.
- Read and save `config.json` only through `src/config/` and core's config
  helpers.
- Expose new runtime state through `ThemeSyncRuntime` or `RuntimeStatus`, never
  through exported mutable bindings.
- `getTuiHandle` gets Pi's live TUI through a transient zero-line `setWidget`
  factory, because `ExtensionUIContext` doesn't expose the color-scheme API.
  Keep the workaround isolated, acquire the handle once per
  `setupAppearanceMonitoring` call, and never cache it across sessions.
- Pi's color-scheme API is the primary terminal source: Pi owns DSR 996/997
  parsing and the notification lifecycle, so never parse color-scheme reports
  from raw terminal input.
- Write a raw terminal query only for OSC 11 polling and the DEC mode 2031
  DECRQM support probe, and route any new one through
  `queryWithTerminalListener` instead of adding a listener of your own.
- Prefer a subscription over polling. With a subscription active, the only timer
  is the low-frequency drift-correction interval, which catches a user changing
  Pi's theme by hand.
- Never turn off terminal color-scheme notifications. They are shared host
  state, and Pi's own automatic theme needs them; cleanup removes only Theme
  Sync's listener.
- Detector labels live in `DETECTOR_LABELS` in `src/runtime.ts`; read them from
  there instead of repeating the text.
