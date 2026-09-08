## 1. Frame primitives

- [x] 1.1 Add repository-local frame, padding, truncation, and ANSI-safe wrapping helpers under `src/ui/`, and verify unit tests cover exact widths, styled text, wide characters, and narrow frames.

## 2. Status command report

- [x] 2.1 Add the pure runtime-status formatter and themed custom-entry renderer, and verify tests cover every status field, absent values, warnings, and semantic colors.
- [x] 2.2 Add TUI transcript delivery and non-TUI notification delivery for `/theme-sync status`, register the entry renderer during theme sync setup, and verify command tests cover both delivery paths and persisted plain entry data.
- [x] 2.3 Route bare, `status`, and unknown `/theme-sync` arguments to config, status reporting, and a usage warning respectively, and verify routing tests show that status does not open an overlay.
- [x] 2.4 Align status report labels and values in a two-space-indented column matching other transcript command reports.
- [x] 2.5 Offer `status` through `/theme-sync` argument completion.

## 3. Framed configuration overlay

- [x] 3.1 Build the focused configuration overlay component with a complete plain frame, accent titles, section rules, contained footers, and framed nested views, and verify rendering tests cover the main view, every nested view, and long paths or values.
- [x] 3.2 Derive list capacity from terminal height while preserving selection across rebuilds, and verify a long theme list on a short terminal keeps the title, footer, and bottom border visible.
- [x] 3.3 Replace manual polling interval editing with Pi's focused `Input`, and verify tests cover cursor focus, ordinary editing, valid confirmation, invalid inline error styling, cancellation, and focus restoration.
- [x] 3.4 Render path-resolution failures, save refusals, save progress, and save success inside the frame with semantic styling and wrapped indentation, and verify existing save-locking and retry tests still pass with new rendering assertions.
- [x] 3.5 Integrate the component with config loading, write-target resolution, persistence, and post-close reload sequencing, remove the obsolete menu and status overlay modes, and verify the existing path, save, reload, and mode-guard suites pass.
- [x] 3.6 Size the configuration overlay so its complete main footer fits without truncation.

## 4. Verification

- [x] 4.1 Review all changed overlay, report, notification, and error text against the project prose conventions, and verify focused string tests cover titles, labels, footer actions, and terminal punctuation.
- [x] 4.2 Run `mise run check` and verify formatting, type checking, linting, and the full test suite pass.
