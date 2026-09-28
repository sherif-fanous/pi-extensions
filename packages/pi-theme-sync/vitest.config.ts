/**
 * Vitest configuration for pi-theme-sync.
 *
 * Test files live under `tests/` and use the `*.test.ts` suffix. Vitest
 * picks up the strict TypeScript settings from `tsconfig.json` via Vite's
 * built-in TS transform; no extra build step is needed.
 *
 * `globals: false` keeps the test files explicit (no ambient `describe`/`it`)
 * which matches the strict imports used elsewhere in the project.
 *
 * `tests/agent-dir-setup.ts` gives every test file an empty agent directory,
 * so a session start in a test never migrates the real User configuration.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/agent-dir-setup.ts"],
  },
});
