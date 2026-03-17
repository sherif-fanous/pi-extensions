## 1. Package and configuration scaffolding

- [x] 1.1 Create the Pi package structure and package metadata for the extension-only package
- [x] 1.2 Define the global and project config file paths and implement config loading that merges defaults, global overrides, and project overrides per key
- [x] 1.3 Implement config parsing for `themes.light`, `themes.dark`, and `detection.pollIntervalMs`
- [x] 1.4 Implement runtime validation of configured themes against Pi theme availability with fallback to built-in `light` and `dark`

## 2. Theme sync runtime

- [x] 2.1 Implement the core extension runtime that resolves appearance and applies mapped Pi themes
- [x] 2.2 Implement state tracking only for the current appearance and active theme
- [x] 2.3 Implement deduplicated theme application to avoid unnecessary `ctx.ui.setTheme(...)` calls
- [x] 2.4 Implement extension startup and shutdown lifecycle handling for detection initialization, update strategy setup, subscription-mode theme reassertion, and cleanup

## 3. Detection pipeline

- [x] 3.1 Implement polling detectors for DSR 996/997, OSC 11, and OS detection
- [x] 3.2 Implement subscription detector support probing for DEC mode 2031
- [x] 3.3 Probe available polling detectors at startup
- [x] 3.4 Probe available subscription detectors at startup
- [x] 3.5 Determine current appearance from available polling detectors in priority order
- [x] 3.6 If DEC mode 2031 is available, subscribe to updates in interactive mode
- [x] 3.7 If DEC mode 2031 is unavailable, poll available polling detectors in priority order on each interval

## 4. Packaging and documentation

- [x] 4.1 Create `package.json` for the Pi package, including Pi metadata and peer dependency declarations required by Pi packages
- [x] 4.2 Create package support files `README.md`, `CHANGELOG.md`, `.gitignore`, and `LICENSE`
- [x] 4.3 Document installation, package usage, supported config locations, fixed detection strategy, and fallback-to-built-in-theme behavior
- [x] 4.4 Verify behavior across the supported fallback paths and validate graceful degradation when configured themes or detection sources are unavailable
