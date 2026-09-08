## 1. Configuration selection and persistence

- [x] 1.1 Add preferred and legacy candidates with shared scope-local, missing-only selection in `src/config.ts`; verify path tests cover both scopes, both files present, legacy-only, preferred-only, neither present, and `PI_CODING_AGENT_DIR` without an additional default-home search.
- [x] 1.2 Route configuration loads through fresh selection while preserving existing validation and project-over-global precedence; verify load tests cover mixed layouts, empty or partial preferred objects masking legacy values, malformed and non-object preferred JSON, non-missing I/O failures, and files created or removed between loads.
- [x] 1.3 Route saves through fresh selection and the existing read-modify-write protection; verify save tests cover continued legacy writes, preferred-only updates when both files exist, new parent-directory creation, unrelated-key preservation, malformed-file refusal, no alternate writes on I/O errors, and migration between load and save.

## 2. Write-target overlay

- [x] 2.1 Replace fixed write-target paths in `src/command.ts` with shared resolved destinations on each opening of the write-target view; verify overlay tests show preferred, legacy, missing, mixed-scope, and overridden-global paths and refreshed labels after manual migration.
- [x] 2.2 Verify the save flow still preserves pending-edit handling, error reporting, and explicit reload behavior by running the existing overlay save and reload tests alongside the new path scenarios.

## 3. Documentation and validation

- [x] 3.1 Update `README.md` with preferred paths, missing-only fallback, continued legacy saves, deprecation without a removal date, and safe manual migration followed by `/reload`; review the text with the humanizer and unslop skills when available, verify examples agree with the specs, and do not recreate or update `HANDOFF.md`.
- [x] 3.2 Run `mise run check` and `openspec validate relocate-settings-with-legacy-fallback --strict`; verify both pass and review the final diff for unintended changes outside this scope.
