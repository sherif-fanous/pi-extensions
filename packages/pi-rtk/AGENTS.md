# RTK

RTK routes the shell commands Pi runs through the rtk binary to reduce LLM token
usage. The family rules are in the root `AGENTS.md` and `docs/`; these notes
apply only to this package.

- rtk's exit codes are permission verdicts (0, 1, 2, and 3 mean allow, no
  equivalent, deny, and ask). Trust stdout and ignore the exit code; RTK
  rewrites, it doesn't gate, so it never enforces the deny verdict.
- Every failure on the rewrite path (a missing binary, a timeout, empty output)
  resolves to no rewrite, and the original command runs. Keep that fallback;
  never fail a shell command because its rewrite failed.
- The rewriting toggle belongs to the Pi process, not the session: it survives
  `/new`, `/resume`, and `/fork`, resets when Pi restarts or the user runs
  `/reload`, and is never written to disk. Pi keeps the module loaded across a
  session switch but calls the default export again, so the toggle is module
  state in `src/runtime.ts`, not part of the runtime each call creates.
- Comment where the code relies on rtk's contract, such as
  `// empty stdout = exit 1 or 2`.
