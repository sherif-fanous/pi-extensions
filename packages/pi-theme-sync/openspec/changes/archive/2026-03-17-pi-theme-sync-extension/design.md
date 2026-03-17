## Context

Pi already supports runtime theme switching through `ctx.ui.setTheme(...)` and exposes raw terminal input listeners to extensions in interactive mode. Pi also includes a minimal `mac-system-theme.ts` example, but that example is intentionally narrow: it polls `osascript`, is macOS-only, and is not robust in sandboxed environments where AppleScript access is certainly blocked.

This change introduces a Pi package that implements automatic theme synchronization as an extension. The extension must prefer terminal-derived appearance when available, because that best represents the effective appearance the user sees and is more likely to work in sandboxed environments. When terminal detection is unavailable or unsupported, the extension must fall back to OS appearance detection. The package must support both global and project configuration files, merged onto defaults with project values overriding global values per key.

The implementation is constrained by Pi internals:

- Raw terminal input is available only in interactive mode through `ctx.ui.onTerminalInput(...)`.
- Pi does not expose a first-class raw terminal output API to extensions, so terminal control sequences must be written directly to stdout and parsed from the terminal input listener.
- Pi already demonstrates this terminal query/response pattern internally for terminal cell size detection, which makes this style of integration technically feasible.

## Goals / Non-Goals

**Goals:**

- Deliver a Pi package that installs an extension for automatic light/dark theme synchronization.
- Support configuration in project `.pi/theme-sync.json` and global `~/.pi/agent/theme-sync.json`, merging onto defaults with project config override semantics per key.
- Support user-defined theme mappings for light and dark appearances.
- Support polling detectors for DSR 996/997, OSC 11, and OS fallback.
- Probe available polling detectors and available subscription detectors separately at runtime.
- Determine current appearance from available polling detectors in priority order.
- Support DEC mode 2031 subscription when available and otherwise poll all available fallback detectors in priority order.
- Fall back safely to Pi built-in `light` and `dark` themes when configured themes do not exist.
- Keep the extension visually quiet during normal operation with no persistent UI or slash-command diagnostics in v1.
- Produce standard package artifacts needed for publishing and maintenance, including `README.md`, `CHANGELOG.md`, `package.json`, `.gitignore`, and `LICENSE`.

**Non-Goals:**

- Shipping bundled custom themes as part of the package.
- Supporting raw terminal control sequence detection in RPC or print mode.
- Guaranteeing that every listed terminal mechanism works in every terminal or platform combination.
- User-configurable detection ordering.
- Persistent status widgets or other always-visible theme sync UI.
- Slash-command diagnostics or debugging UI in v1.
- Replacing Pi core theme selection behavior outside the extension runtime.

## Decisions

### Decision: Separate polling detectors from subscription detectors

The runtime will model terminal detection around two detector categories:

- polling detectors: `dsr-996`, `osc-11`, `os`
- subscription detectors: `dec-mode-2031`

This was chosen because polling detectors answer the question “what is the appearance right now?” while subscription detectors answer the question “can the runtime receive future appearance changes without polling?”

Alternatives considered:

- Treat all detectors as one uniform kind: more generic, but less expressive.
- Hard-code DEC mode 2031 separately in the runtime without a detector model: simpler short term, but less organized.

### Decision: Probe available polling detectors and available subscription detectors separately

On startup, the runtime will independently probe which polling detectors and which subscription detectors are available. Current appearance will be determined from available polling detectors in priority order, while update behavior will prefer any available subscription detector.

This was chosen because detector availability and current appearance are distinct concerns. Separate probing keeps the logic direct and avoids overloading one function with multiple responsibilities.

Alternatives considered:

- Probe all detectors into one shared availability map: more generic, but heavier and less direct for the current implementation.
- Stop at the first polling detector that returns an appearance: simpler, but loses knowledge about which other polling fallbacks remain available.

### Decision: Prefer DEC mode 2031 for updates when available, otherwise poll all available polling detectors in priority order

After startup, the runtime will prefer DEC mode 2031 subscription when supported. In subscription mode, the runtime may also perform lightweight local reassertion checks that compare the last known appearance against Pi's currently active theme and reapply the configured mapping when needed. If DEC mode 2031 is unavailable, the runtime will poll all available polling detectors in built-in priority order on each interval and use the first detector that returns a concrete appearance.

This was chosen because choosing one polling detector once at startup is too rigid. A detector that worked at startup may later fail transiently, while a lower-priority detector might still provide a useful answer. The lightweight reassertion check keeps the configured mapping authoritative even when appearance does not change and no new subscription event is emitted.

Alternatives considered:

- Pick one fallback detector at startup and always poll only that detector: simpler, but less resilient.
- Poll all detectors in arbitrary order: less aligned with the intended priority model.
- Rely only on subscription events after enabling DEC mode 2031: simpler, but can leave Pi on a theme that no longer matches the configured mapping until a future appearance change occurs.

### Decision: Prefer terminal-derived appearance before OS fallback

The extension will treat terminal-derived appearance as the preferred source of truth when available, then fall back to OS appearance if terminal detection is unavailable.

This was chosen because users see Pi through the terminal, and terminal appearance may intentionally differ from the desktop OS setting. It also improves behavior in sandboxed environments where terminal control may still work while desktop automation APIs do not.

Alternatives considered:

- OS-first semantics: simpler to explain, but less faithful to the actual terminal appearance.
- OS-only semantics: fails the portability and sandbox robustness goals.

### Decision: Use direct stdout writes plus `ctx.ui.onTerminalInput(...)` for terminal control sequences

Terminal control sequence integration will be implemented in interactive mode by sending query and mode-control sequences to stdout and parsing responses from the extension raw terminal input hook.

The extension will use:

- DSR 996/997 for current-state queries
- DECRQM (`CSI ? 2031 $ p`) to determine whether DEC mode 2031 is recognized
- `CSI ? 2031 h` / `CSI ? 2031 l` to enable and disable unsolicited palette update notifications
- OSC 11 to query terminal background color

This was chosen because Pi exposes raw terminal input listeners to extensions, but does not expose a dedicated terminal query API. Pi’s own TUI already uses this query/response pattern internally, so the design is aligned with the runtime’s behavior.

Alternatives considered:

- Avoid terminal sequence integration until Pi exposes a dedicated API: safer, but would postpone the package’s core portability advantage.
- Patch Pi core first: out of scope for this package-first change.

### Decision: Store configuration in JSON files at global and project scopes

The extension will load configuration from `~/.pi/agent/theme-sync.json` and an optional project `.pi/theme-sync.json`, starting from defaults, then applying global config overrides, then project overrides on a per-key basis. The configuration format will expose only theme mappings and polling settings.

This was chosen because the behavior must be configurable both per-user and per-project, and Pi already uses similar global/project configuration patterns.

Alternatives considered:

- Store everything in Pi settings.json: tighter integration, but less portable for a package and more likely to create coupling with unrelated Pi settings.
- Global-only config: too limiting for project-specific theme preferences.

### Decision: Keep the extension operationally silent in v1

The extension will not expose persistent UI, slash-command diagnostics, or debugging helpers in v1. It will operate in the background and only affect Pi theme selection.

This was chosen to keep the package focused, unobtrusive, and easy to reason about. Diagnostics can be introduced later as a separate change if needed.

Alternatives considered:

- Persistent widget showing runtime state: too distracting for the value it provides.
- Slash-command diagnostics: useful, but enough extra UI and state management to justify a separate change.

### Decision: Validate configured themes and degrade to Pi built-ins

At startup, the extension will validate configured theme names against available Pi themes. If a configured mapping is invalid, the runtime will fall back to Pi built-ins `light` and `dark` for the corresponding appearance state.

This was chosen to keep the package resilient and easy to recover from configuration mistakes.

Alternatives considered:

- Hard failure on invalid theme names: more explicit, but degrades UX.
- Silent no-op: too opaque for users.

## Risks / Trade-offs

- **Terminal control sequence support varies by terminal** → Implement strict timeouts, narrow parsing, and automatic fallback to lower-priority mechanisms.
- **Pi does not expose a dedicated raw terminal write API for extensions** → Isolate stdout-based terminal sequence logic so it can be replaced later if Pi adds a public API.
- **Raw terminal input is interactive-mode only** → Disable terminal-sequence-based detection outside interactive mode.
- **Terminal responses could interfere with normal input handling** → Consume only recognized terminal responses and leave unrelated input untouched.
- **Polling OS fallbacks may feel sluggish** → Make polling interval configurable and avoid polling when DEC mode 2031 subscription is supported.
- **Platform-specific OS detection is uneven across Linux/Windows/macOS** → Treat OS detection as layered best-effort fallbacks, not guaranteed behavior.
- **Configured themes may not exist in the current Pi installation** → Validate at runtime and fall back to built-in `light`/`dark` mappings.

## Migration Plan

This change introduces a new optional package and does not require migration of existing Pi behavior.

1. Install the package globally or project.
2. Add configuration in the supported global or project config file path.
3. Start Pi with the extension loaded via package discovery.
4. On startup, the extension validates configuration, probes available polling and subscription detectors, and determines current appearance.
5. The runtime then either subscribes to DEC mode 2031 notifications with lightweight local theme reassertion checks or polls available polling detectors in priority order.
6. If the package is removed, Pi falls back to its normal theme behavior with no data migration required.

Rollback is straightforward: remove the package or delete its configuration file.

## Open Questions

- Which OS fallback mechanisms should be included in v1 for Linux and Windows beyond the current `os` detector abstraction?
- For OSC 11, should v1 use direct background color queries only, or also support environment-based heuristics when queries are unsupported?
