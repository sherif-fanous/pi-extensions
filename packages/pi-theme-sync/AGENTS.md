# Theme Sync

Theme Sync switches Pi's theme to match the terminal or system appearance. The
family rules are in the root `AGENTS.md` and `docs/`; these notes apply only to
this package.

- Add a detector by writing its implementation in its own file under
  `src/detectors/` and adding an entry for it to `THEME_SYNC_DETECTORS` in
  `src/detectors/index.ts`: a polling detector in `polling` with its `label` and
  `detect`, a subscription detector in `subscription` with its `label`,
  `isSupported`, `subscribe`, and `stoppedWarning`. Each list is in priority
  order. Nothing else should need to change.
- Detector labels live on those entries; read them from there instead of
  repeating the text.
- Test the runtime through `createThemeSyncRuntime({ detectors, schedule })`
  with the fakes in `tests/helpers/fake-detectors.ts`, never by mocking detector
  modules. Only `runtime-cycle.test.ts` runs the real detectors, to feed them
  terminal bytes.
- Read and save `config.json` only through `THEME_SYNC_CONFIG`, the core config
  handle `src/config/load.ts` defines. The layout migration saves with its
  `write`, and the session start calls `notify` on the loaded outcome after
  probing, with the detector warnings as extras.
- Expose new runtime state through `ThemeSyncRuntime` or `RuntimeStatus`, never
  through exported mutable bindings.
- `probeDetectors` gets Pi's live TUI through core's `getLiveTui`, because
  `ExtensionUIContext` doesn't expose the color-scheme API. Acquire the handle
  once per session start (in `probeDetectors`), and never cache it across
  sessions.
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
